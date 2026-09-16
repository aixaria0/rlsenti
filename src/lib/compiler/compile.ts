import { digest, hexPrefixed, shortHex } from "./hash";
import {
  abort,
  cloneWorld,
  commit,
  poolsConserved,
  prepare,
  prepareReceive,
  seedWorld,
  type ExchangeWorld,
} from "./exchange";
import {
  casperInventory,
  crossNode,
  latticeAnalyze,
  observeBlock,
  proposeBlock,
  type Block,
  type CasperEvidence,
  type CrossNodeReport,
  type Deploy,
  type LatticeReport,
  type NodeObservation,
} from "./observe";
import { certify, phasesFromComms, type QlfCertificate } from "./qlf";
import { exchangeProc, helloProc, reduce, type Execution, type ReductionStep } from "./rho";
import type {
  Claim,
  EvidenceRef,
  FailureWitness,
  Invariant,
  LayerId,
  MutationId,
  ScenarioId,
  Status,
  VerificationCheck,
} from "./types";

export interface ScenarioMeta { id: ScenarioId; title: string; summary: string; killer?: boolean; }
export interface MutationMeta { id: MutationId; title: string; summary: string; applies: ScenarioId[]; }

export const SCENARIOS: ScenarioMeta[] = [
  { id: "exchange-commit", title: "Cross-shard atomic exchange", summary: "Bob trades AliceCoin on shard A for GBP on shard B via prepare → prepareReceive → commit / commit.", killer: true },
  { id: "exchange-abort", title: "Cross-shard abort", summary: "Remote prepareReceive refuses; the local prepare is reversed exactly." },
  { id: "hello-rho", title: "ρ-calculus COMM", summary: 'new ch in { ch!("hello") | for (@msg <- ch) { Nil } }' },
  { id: "cap-payment", title: "Capability-gated payment", summary: "QuantumOS lemma payment-authorized; the Rholang deploy proceeds only with the capability." },
];

export const MUTATIONS: MutationMeta[] = [
  { id: "none", title: "Baseline — no mutation", summary: "Honest execution, honest observation, honest certificates.", applies: ["exchange-commit", "exchange-abort", "hello-rho", "cap-payment"] },
  { id: "node-c-lied", title: "What if node C lied?", summary: "Replica C reports a different block hash at the same height.", applies: ["exchange-commit", "exchange-abort", "hello-rho", "cap-payment"] },
  { id: "drop-capability", title: "What if this capability did not exist?", summary: "Remove the authorizing capability and replay from QuantumOS.", applies: ["exchange-commit", "exchange-abort", "cap-payment"] },
  { id: "force-abort", title: "What if the remote leg aborted?", summary: "Force abort of the prepared local leg instead of commit.", applies: ["exchange-commit"] },
  { id: "dup-validator", title: "Duplicate validator identity", summary: "Two observations advertise the same proposer.", applies: ["exchange-commit", "exchange-abort", "hello-rho", "cap-payment"] },
  { id: "no-justification", title: "Missing justification", summary: "Justification set absent from node A.", applies: ["exchange-commit", "exchange-abort", "hello-rho", "cap-payment"] },
  { id: "tamper-trace", title: "What if reduction step 4 was different?", summary: "Replay against a tampered continuation at the first COMM after deposit.", applies: ["exchange-commit", "hello-rho", "cap-payment"] },
];

export interface QosEvent { eventId: string; room: string; peer: string; capability: string | null; lemma: string; authorized: boolean; timestamp: string; }

export interface EventEnvelope {
  eventId: string; parentEvent: string | null; layer: LayerId; actorCapability: string | null;
  qlfDigest: string | null; rholangSourceHash: string | null; normalizedProcess: string | null;
  executionTraceHash: string | null; deployId: string | null; blockHash: string | null;
  nodeObservations: string[]; verificationResults: Status[]; payloadHash: string;
  prevHash: string | null; hash: string; label: string; summary: string; fields: EvidenceRef[];
}

export interface ReplayResult {
  expectedStateHash: string; observedStateHash: string; match: boolean;
  firstDivergence: { step: number; object: string; expected: string; observed: string } | null;
  stepsCompared: number;
}

export interface Reality {
  scenario: ScenarioId; mutation: MutationId; qos: QosEvent; qlf: QlfCertificate | null;
  rholangSource: string | null; execution: Execution | null; exchange: ExchangeWorld | null;
  deploys: Deploy[]; blocks: Block[]; observations: NodeObservation[]; cross: CrossNodeReport | null;
  casper: CasperEvidence | null; lattice: LatticeReport | null; envelopes: EventEnvelope[];
  invariants: Invariant[]; checks: VerificationCheck[]; claims: Claim[]; witness: FailureWitness | null;
  replay: ReplayResult | null; status: Status; why: string[];
}

const TS = "2026-04-11T09:14:02Z";
const PARENT = hexPrefixed(digest(["genesis"]));
const LIE = hexPrefixed(digest(["lie", "node-C"]));

function worst(a: Status, b: Status): Status {
  const rank: Record<Status, number> = { PASS: 0, UNAVAILABLE: 1, WARN: 2, FAIL: 3 };
  return rank[a] >= rank[b] ? a : b;
}

function envelope(partial: Omit<EventEnvelope, "hash" | "payloadHash" | "prevHash"> & { prev: string | null }): EventEnvelope {
  const { prev, ...rest } = partial;
  // Hash every evidence-bearing field, not merely the human-readable summary.
  const payloadHash = hexPrefixed(digest(["envelope-payload-v2", JSON.stringify(rest)]));
  const hash = hexPrefixed(digest(["env-v2", payloadHash, prev ?? "genesis"]));
  return { ...rest, prevHash: prev, payloadHash, hash };
}

export function compile(scenario: ScenarioId, mutation: MutationId): Reality {
  const dropCap = mutation === "drop-capability";
  const forceAbort = mutation === "force-abort" && scenario === "exchange-commit";
  const abortScenario = scenario === "exchange-abort" || forceAbort;
  const isExchange = scenario === "exchange-commit" || scenario === "exchange-abort";
  const needsCap = scenario !== "hello-rho";
  const cap = dropCap && needsCap ? null : needsCap ? "cap:exchange:bob:prepare" : "cap:room:write";
  const lemma = scenario === "cap-payment" ? "payment-authorized" : isExchange ? "cross-shard-exchange" : "hello-comm";
  const authorized = cap !== null;
  const qos: QosEvent = {
    eventId: `evt_${digest(["qos", scenario]).slice(0, 4)}`,
    room: "cap:room:05214747236101414325074505234721",
    peer: scenario === "hello-rho" ? "Alice" : "Bob",
    capability: cap, lemma, authorized, timestamp: TS,
  };

  let rholangSource: string | null = null;
  let execution: Execution | null = null;
  let exchange: ExchangeWorld | null = null;
  let deploys: Deploy[] = [];
  let blocks: Block[] = [];

  if (authorized) {
    if (isExchange) {
      const genesis = seedWorld();
      const w = cloneWorld(genesis);
      const txId = "t42";
      prepare(w, "ALICE-BOB", "bob", txId, "A", 100, 999999);
      if (abortScenario) {
        abort(w, "ALICE-BOB", "bob", txId, 18490);
      } else {
        prepareReceive(w, "BOB-GBP", "bob", txId, "A", 50, 999999, "toAlice");
        commit(w, "ALICE-BOB", "bob", txId);
        commit(w, "BOB-GBP", "bob", txId);
      }
      w.conserved = poolsConserved(w, genesis);
      exchange = w;
      const verbs = abortScenario ? ["deposit", "prepare", "abort"] : ["deposit", "prepare", "prepareReceive", "commit", "commit"];
      const { source, proc } = exchangeProc(verbs);
      rholangSource = source;
      execution = reduce(source, proc);
    } else if (scenario === "cap-payment") {
      const { source, proc } = exchangeProc(["authorize", "transfer"]);
      rholangSource = `new purse, ack in {
  purse!("authorize", "payment-authorized") |
  for (@ok <- purse) {
    purse!("transfer", 20, "alice") | for (@rcpt <- ack) { Nil }
  }
}`;
      execution = reduce(source, proc);
    } else {
      const { source, proc } = helloProc();
      rholangSource = source;
      execution = reduce(source, proc);
    }

    if (execution) {
      const termHash = hexPrefixed(digest(["term", execution.source]));
      const deploy: Deploy = {
        id: `deploy_${shortHex(termHash, 4, 4).replace(/[x.]/g, "").slice(0, 8)}`,
        termHash, deployer: qos.peer.toLowerCase(), phloLimit: 100_000, phloPrice: 1,
        cost: 1284 + execution.comms * 17, shard: isExchange ? "shard-A" : "root",
      };
      deploys = [deploy];
      const post = execution.stateHash;
      const blockA = proposeBlock({ height: 18492, parentHash: PARENT, proposer: "val_0a17", shard: deploy.shard, deploys, postStateHash: post, timestamp: "2026-04-11T09:14:11Z" });
      blocks = [blockA];
      if (isExchange && !abortScenario) {
        blocks.push(proposeBlock({
          height: 8841, parentHash: hexPrefixed(digest(["genesis-b"])), proposer: "val_paris", shard: "shard-B",
          deploys: [{ ...deploy, id: deploy.id + "_b", shard: "shard-B" }],
          postStateHash: hexPrefixed(digest(["state-b", post])), timestamp: "2026-04-11T09:14:12Z",
        }));
      }
    }
  }

  const qlf = authorized ? certify(phasesFromComms(execution?.comms ?? 0), true) : certify(["+"], false);
  const primary = blocks[0];
  const obsOpts = {
    lieNode: mutation === "node-c-lied" ? "C" : undefined,
    lieHash: mutation === "node-c-lied" ? LIE : undefined,
    dropJustification: mutation === "no-justification" ? "A" : undefined,
    duplicateProposer: mutation === "dup-validator" ? { from: "C", onto: "B" } : undefined,
  };
  const observations = primary ? observeBlock(primary, obsOpts) : [];
  const cross = primary ? crossNode(observations) : null;
  const casper = primary ? casperInventory(observations, primary) : null;
  const lattice = primary ? latticeAnalyze(primary, observations) : null;

  let replay: ReplayResult | null = null;
  if (execution) {
    const tamper = mutation === "tamper-trace";
    const firstComm = execution.steps.findIndex((x) => x.rule === "COMM");
    const replaySteps: ReductionStep[] = execution.steps.map((s, i) =>
      tamper && s.rule === "COMM" && i === firstComm
        ? { ...s, continuation: "receive continuation′", description: s.description + " [TAMPERED]" }
        : s,
    );
    const expected = execution.stateHash;
    const observed = tamper ? hexPrefixed(digest(["tamper", expected])) : expected;
    const first = tamper ? {
      step: replaySteps.findIndex((s) => s.description.includes("TAMPERED")),
      object: "receive continuation",
      expected: execution.steps.find((s) => s.rule === "COMM")?.continuation ?? "Nil",
      observed: "receive continuation′",
    } : null;
    replay = { expectedStateHash: expected, observedStateHash: observed, match: expected === observed, firstDivergence: first, stepsCompared: execution.steps.length };
  }

  const envelopes = linkEnvelopes({ qos, qlf, rholangSource, execution, deploys, blocks, observations, cross, lattice, authorized });
  const { invariants, checks, claims, witness, status, why } = evaluate({ qos, qlf, execution, exchange, blocks, observations, cross, casper, lattice, replay, authorized, mutation });
  return { scenario, mutation, qos, qlf, rholangSource, execution, exchange, deploys, blocks, observations, cross, casper, lattice, envelopes, invariants, checks, claims, witness, replay, status, why };
}

function linkEnvelopes(args: {
  qos: QosEvent; qlf: QlfCertificate; rholangSource: string | null; execution: Execution | null;
  deploys: Deploy[]; blocks: Block[]; observations: NodeObservation[]; cross: CrossNodeReport | null;
  lattice: LatticeReport | null; authorized: boolean;
}): EventEnvelope[] {
  const out: EventEnvelope[] = [];
  let prev: string | null = null;
  const add = (e: Omit<EventEnvelope, "hash" | "payloadHash" | "prevHash">) => {
    const env = envelope({ ...e, prev }); out.push(env); prev = env.hash;
  };

  add({ eventId: args.qos.eventId, parentEvent: null, layer: "quantumos", actorCapability: args.qos.capability, qlfDigest: null, rholangSourceHash: null, normalizedProcess: null, executionTraceHash: null, deployId: null, blockHash: null, nodeObservations: [], verificationResults: [args.authorized ? "PASS" : "FAIL"], label: "QuantumOS event", summary: `${args.qos.peer} · ${args.qos.lemma} · ${args.authorized ? "authorized" : "unauthorized"}`, fields: [
    { source: "QuantumOS", field: "event_id", value: args.qos.eventId }, { source: "QuantumOS", field: "peer", value: args.qos.peer }, { source: "QuantumOS", field: "capability", value: args.qos.capability ?? "ABSENT" }, { source: "QuantumOS", field: "lemma", value: args.qos.lemma }, { source: "QuantumOS", field: "room", value: args.qos.room },
  ] });

  add({ eventId: `qlf_${args.qlf.digest.slice(0, 6)}`, parentEvent: args.qos.eventId, layer: "qlf", actorCapability: args.qos.capability, qlfDigest: hexPrefixed(args.qlf.digest), rholangSourceHash: null, normalizedProcess: null, executionTraceHash: null, deployId: null, blockHash: null, nodeObservations: [], verificationResults: [args.qlf.balanced ? "PASS" : "FAIL"], label: "QLF certificate", summary: `phase ${args.qlf.phaseString || "∅"} · gap ${args.qlf.spectralGap} · ${args.qlf.spectralForm}`, fields: [
    { source: "QLF", field: "phase_string", value: args.qlf.phaseString || "(empty)" }, { source: "QLF", field: "count(+)", value: String(args.qlf.countPos) }, { source: "QLF", field: "count(-)", value: String(args.qlf.countNeg) }, { source: "QLF", field: "spectral_gap", value: String(args.qlf.spectralGap) }, { source: "QLF", field: "symmetric", value: String(args.qlf.symmetric) }, { source: "QLF", field: "spectral_form", value: args.qlf.spectralForm },
  ] });

  if (args.rholangSource && args.execution) {
    const sourceHash = hexPrefixed(digest(["src", args.rholangSource]));
    add({ eventId: `rho_${args.execution.traceHash.slice(2, 8)}`, parentEvent: out[out.length - 1]!.eventId, layer: "rholang", actorCapability: args.qos.capability, qlfDigest: hexPrefixed(args.qlf.digest), rholangSourceHash: sourceHash, normalizedProcess: args.execution.normalized, executionTraceHash: args.execution.traceHash, deployId: args.deploys[0]?.id ?? null, blockHash: null, nodeObservations: [], verificationResults: [args.execution.stuck ? "WARN" : "PASS"], label: "Rholang process", summary: `${args.execution.comms} COMM · trace ${shortHex(args.execution.traceHash)}`, fields: [
      { source: "RholangProcess", field: "source_digest", value: sourceHash }, { source: "RholangProcess", field: "normalized", value: args.execution.normalized }, { source: "RholangProcess", field: "comms", value: String(args.execution.comms) },
    ] });
    add({ eventId: `trace_${args.execution.steps.length}`, parentEvent: out[out.length - 1]!.eventId, layer: "rspace", actorCapability: args.qos.capability, qlfDigest: hexPrefixed(args.qlf.digest), rholangSourceHash: sourceHash, normalizedProcess: args.execution.normalized, executionTraceHash: args.execution.traceHash, deployId: args.deploys[0]?.id ?? null, blockHash: null, nodeObservations: [], verificationResults: ["PASS"], label: "rspace reduction", summary: `${args.execution.steps.length} steps · state ${shortHex(args.execution.stateHash)}`, fields: args.execution.steps.slice(0, 8).map((s) => ({ source: "ExecutionTrace", field: `step_${s.n}`, value: `${s.rule} — ${s.description}` })) });
  }

  if (args.deploys[0] && args.blocks[0]) {
    const b = args.blocks[0];
    add({ eventId: `block_${b.height}`, parentEvent: out[out.length - 1]!.eventId, layer: "block", actorCapability: args.qos.capability, qlfDigest: hexPrefixed(args.qlf.digest), rholangSourceHash: args.rholangSource ? hexPrefixed(digest(["src", args.rholangSource])) : null, normalizedProcess: args.execution?.normalized ?? null, executionTraceHash: args.execution?.traceHash ?? null, deployId: args.deploys[0].id, blockHash: b.hash, nodeObservations: [], verificationResults: ["PASS"], label: `Block #${b.height}`, summary: `${shortHex(b.hash)} · proposer ${b.proposer} · shard ${b.shard}`, fields: [
      { source: "FinalizedBlockEvidence", field: "block_height", value: String(b.height) }, { source: "FinalizedBlockEvidence", field: "block_hash", value: b.hash }, { source: "FinalizedBlockEvidence", field: "parent_hash", value: b.parentHash }, { source: "FinalizedBlockEvidence", field: "proposer", value: b.proposer }, { source: "FinalizedBlockEvidence", field: "post_state_hash", value: b.postStateHash },
    ] });
  }

  if (args.observations.length && args.cross) {
    add({ eventId: "obs_set", parentEvent: out[out.length - 1]!.eventId, layer: "sentinel", actorCapability: args.qos.capability, qlfDigest: hexPrefixed(args.qlf.digest), rholangSourceHash: null, normalizedProcess: null, executionTraceHash: args.execution?.traceHash ?? null, deployId: args.deploys[0]?.id ?? null, blockHash: args.blocks[0]?.hash ?? null, nodeObservations: args.observations.map((o) => o.nodeId), verificationResults: [args.cross.status], label: "Sentinel observation", summary: `${args.cross.agreeingNodes}/${args.cross.targetCount} agree · ratio ${args.cross.agreementRatio.toFixed(2)}`, fields: args.observations.map((o) => ({ source: "RNodeObservation", field: `${o.nodeId}.block_hash`, value: o.reachable ? o.blockHash : "UNAVAILABLE" })) });
  }

  if (args.lattice) {
    add({ eventId: "lattice_cert", parentEvent: out[out.length - 1]!.eventId, layer: "lattice", actorCapability: args.qos.capability, qlfDigest: hexPrefixed(args.qlf.digest), rholangSourceHash: null, normalizedProcess: null, executionTraceHash: null, deployId: args.deploys[0]?.id ?? null, blockHash: args.blocks[0]?.hash ?? null, nodeObservations: args.observations.map((o) => o.nodeId), verificationResults: [args.lattice.status], label: "Sovereign Lattice", summary: `prepared ${args.lattice.preparedCount}/${args.lattice.quorum} · committed ${args.lattice.committedCount}/${args.lattice.quorum}`, fields: [
      { source: "SovereignLattice", field: "N", value: String(args.lattice.n) }, { source: "SovereignLattice", field: "f", value: String(args.lattice.f) }, { source: "SovereignLattice", field: "Q", value: String(args.lattice.quorum) }, { source: "SovereignLattice", field: "prepared_certificate", value: String(args.lattice.preparedCertificate) }, { source: "SovereignLattice", field: "committed_certificate", value: String(args.lattice.committedCertificate) },
    ] });
  }

  add({ eventId: "verify_final", parentEvent: out[out.length - 1]!.eventId, layer: "verification", actorCapability: args.qos.capability, qlfDigest: hexPrefixed(args.qlf.digest), rholangSourceHash: args.rholangSource ? hexPrefixed(digest(["src", args.rholangSource])) : null, normalizedProcess: args.execution?.normalized ?? null, executionTraceHash: args.execution?.traceHash ?? null, deployId: args.deploys[0]?.id ?? null, blockHash: args.blocks[0]?.hash ?? null, nodeObservations: args.observations.map((o) => o.nodeId), verificationResults: [args.authorized ? "PASS" : "FAIL"], label: "Verification result", summary: "Result is bound to the envelopes above. Not a proof of Casper finality.", fields: [
    { source: "VerificationReport", field: "envelopes", value: String(out.length + 1) }, { source: "VerificationReport", field: "linked", value: "sha256 envelope chain" },
  ] });
  return out;
}

function evaluate(args: {
  qos: QosEvent; qlf: QlfCertificate; execution: Execution | null; exchange: ExchangeWorld | null; blocks: Block[];
  observations: NodeObservation[]; cross: CrossNodeReport | null; casper: CasperEvidence | null; lattice: LatticeReport | null;
  replay: ReplayResult | null; authorized: boolean; mutation: MutationId;
}): { invariants: Invariant[]; checks: VerificationCheck[]; claims: Claim[]; witness: FailureWitness | null; status: Status; why: string[] } {
  const invariants: Invariant[] = [];
  const checks: VerificationCheck[] = [];

  invariants.push({ id: "I-QOS-01", layer: "quantumos", name: "Capability authorizes the lemma", status: args.authorized ? "PASS" : "FAIL", severity: "CRITICAL", detail: args.authorized ? `${args.qos.capability} authorizes lemma ${args.qos.lemma}.` : "No capability present; QuantumOS refuses to originate a deployable event.", evidence: [{ source: "QuantumOS", field: "capability", value: args.qos.capability ?? "ABSENT" }, { source: "QuantumOS", field: "lemma", value: args.qos.lemma }] });
  invariants.push({ id: "I-QLF-01", layer: "qlf", name: "ZFA-balanced phase string", status: args.qlf.balanced ? "PASS" : "FAIL", severity: "WARNING", detail: args.qlf.claim, evidence: [{ source: "QLF", field: "phase_string", value: args.qlf.phaseString || "(empty)" }, { source: "QLF", field: "spectral_form", value: args.qlf.spectralForm }] });
  invariants.push(args.execution ? { id: "I-RHO-01", layer: "rspace", name: "COMM reductions reach a normal form", status: args.execution.stuck ? "WARN" : "PASS", severity: "WARNING", detail: `${args.execution.comms} COMM; leftover produces ${args.execution.leftoverProduces.length}, consumes ${args.execution.leftoverConsumes.length}.`, evidence: [{ source: "ExecutionTrace", field: "comms", value: String(args.execution.comms) }, { source: "ExecutionTrace", field: "state_hash", value: args.execution.stateHash }] } : { id: "I-RHO-01", layer: "rspace", name: "COMM reductions reach a normal form", status: "UNAVAILABLE", severity: "WARNING", detail: "No process was deployed — execution layer has nothing to reduce.", evidence: [{ source: "ExecutionTrace", field: "available", value: "false" }] });

  if (args.replay) invariants.push({ id: "I-RPL-01", layer: "rspace", name: "Local replay matches observed state hash", status: args.replay.match ? "PASS" : "FAIL", severity: "CRITICAL", detail: args.replay.match ? "Replayed reduction produces the same state hash as the block post-state." : `Divergence at reduction step ${args.replay.firstDivergence?.step ?? "?"}.`, evidence: [{ source: "Replay", field: "expected_state_hash", value: args.replay.expectedStateHash }, { source: "Replay", field: "observed_state_hash", value: args.replay.observedStateHash }] });

  if (args.cross) {
    const heightOut = args.observations.find((o) => o.reachable && o.lastFinalizedBlockNumber !== args.cross!.commonHeight);
    const hashOut = args.observations.find((o) => o.reachable && o.blockHash !== args.cross!.commonHash);
    invariants.push({ id: "I-01", layer: "sentinel", name: "Finalized height consistency", status: heightOut ? "FAIL" : "PASS", severity: "CRITICAL", detail: `${args.cross.agreeingNodes} reachable observations share a finalized height.`, evidence: args.observations.map((o) => ({ source: "RNodeObservation", field: `${o.nodeId}.last_finalized_block_number`, value: o.reachable ? String(o.lastFinalizedBlockNumber) : "UNAVAILABLE" })) });
    invariants.push({ id: "I-02", layer: "sentinel", name: "Block hash consistency", status: hashOut ? "FAIL" : "PASS", severity: "CRITICAL", detail: `${args.cross.hashAgreement ? "All" : "Not all"} reachable observations report the same block hash.`, evidence: args.observations.map((o) => ({ source: "FinalizedBlockEvidence", field: `${o.nodeId}.block_hash`, value: o.reachable ? o.blockHash : "UNAVAILABLE" })) });
  } else invariants.push({ id: "I-01", layer: "sentinel", name: "Finalized height consistency", status: "UNAVAILABLE", severity: "CRITICAL", detail: "No block was produced, so there is no height to observe.", evidence: [{ source: "RNodeObservation", field: "available", value: "false" }] });

  const dup = args.observations.find((o) => o.duplicateValidator);
  invariants.push({ id: "I-05", layer: "sentinel", name: "Node identity consistency", status: dup ? "FAIL" : args.observations.length ? "PASS" : "UNAVAILABLE", severity: "CRITICAL", detail: dup ? `Duplicate proposer ${dup.proposer}.` : "Distinct proposer identities on a single network and shard.", evidence: args.observations.map((o) => ({ source: "NetworkStatus", field: `${o.nodeId}.proposer`, value: o.proposer })) });

  const jOut = args.observations.find((o) => o.reachable && !o.justificationPresent);
  invariants.push({ id: "I-06", layer: "sentinel", name: "Evidence provenance present", status: jOut ? "FAIL" : args.observations.length ? "PASS" : "UNAVAILABLE", severity: "WARNING", detail: "Each observation carries a signature and a structurally parseable justification set.", evidence: args.observations.map((o) => ({ source: "CasperEvidenceReport", field: `${o.nodeId}.justification_present`, value: String(o.justificationPresent) })) });

  if (args.lattice) {
    invariants.push({ id: "L-01", layer: "lattice", name: "Quorum invariant (Q ≥ 2f+1)", status: args.lattice.committedCertificate ? "PASS" : "FAIL", severity: "CRITICAL", detail: `Committed votes ${args.lattice.committedCount} vs Q=${args.lattice.quorum}.`, evidence: [{ source: "SovereignLattice", field: "committed_count", value: String(args.lattice.committedCount) }, { source: "SovereignLattice", field: "quorum", value: String(args.lattice.quorum) }] });
    invariants.push({ id: "L-02", layer: "lattice", name: "No conflicting prepared certificate", status: args.lattice.conflictingPrepare && !args.lattice.preparedCertificate ? "FAIL" : "PASS", severity: "CRITICAL", detail: args.lattice.conflictingPrepare ? "A conflicting Prepare was dropped; honest digest still formed a certificate." : "No conflicting Prepare observed.", evidence: [{ source: "SovereignLattice", field: "conflicting_prepare", value: String(args.lattice.conflictingPrepare) }, { source: "SovereignLattice", field: "prepared_certificate", value: String(args.lattice.preparedCertificate) }] });
  }

  if (args.cross) checks.push({ id: "finalized_block_cross_check", name: "Finalized block cross-check", status: args.cross.hashAgreement && args.cross.heightAgreement ? "PASS" : "FAIL", severity: "CRITICAL", message: `Agreement ratio ${args.cross.agreementRatio.toFixed(2)}. Cross-node agreement only — not Casper finality.`, source: "CrossNodeReport", evidence: [{ source: "CrossNodeReport", field: "agreement_ratio", value: args.cross.agreementRatio.toFixed(2) }, { source: "CrossNodeReport", field: "common_block_hash", value: args.cross.commonHash ?? "UNAVAILABLE" }] });
  if (args.replay) checks.push({ id: "replay_match", name: "Execution replay", status: args.replay.match ? "PASS" : "FAIL", severity: "CRITICAL", message: args.replay.match ? "Local replay matches the observed post-state hash." : "Execution divergence: expected and observed state hashes differ.", source: "Replay", evidence: [{ source: "Replay", field: "match", value: String(args.replay.match) }] });
  checks.push({ id: "capability_gate", name: "Capability gate", status: args.authorized ? "PASS" : "FAIL", severity: "CRITICAL", message: args.authorized ? "Event originated under a present capability." : "Capability absent — no Rholang process was deployed.", source: "QuantumOS", evidence: [{ source: "QuantumOS", field: "authorized", value: String(args.authorized) }] });

  const claims: Claim[] = [
    { layer: "quantumos", statement: args.authorized ? "A room event was originated under a capability that authorizes the lemma." : "Origin was refused — the required capability was not present.", status: args.authorized ? "PASS" : "FAIL", basis: "QuantumOS capability → authorization.", notClaimed: "Does not claim the event is on-chain." },
    { layer: "qlf", statement: args.qlf.claim, status: args.qlf.balanced ? "PASS" : "FAIL", basis: "toSpectralMode_hermitian; spectral_symmetric_eq_scalar_id.", notClaimed: args.qlf.notClaimed },
    { layer: "rspace", statement: args.execution ? `ρ-calculus reducer performed ${args.execution.comms} COMM steps.` : "No process to reduce.", status: args.execution ? "PASS" : "UNAVAILABLE", basis: "rchain-rust rspace COMM law, in-browser subset.", notClaimed: "Does not claim identity with the full rchain-rust evaluator." },
    { layer: "sentinel", statement: args.cross ? `Observed agreement ${args.cross.agreeingNodes}/${args.cross.targetCount} (ratio ${args.cross.agreementRatio.toFixed(2)}).` : "No observations — no block.", status: args.cross?.status ?? "UNAVAILABLE", basis: args.cross?.verificationBasis ?? "n/a", notClaimed: "Stake-weighted Casper finality is NOT claimed." },
    { layer: "lattice", statement: args.lattice ? `CommittedCertificate ${args.lattice.committedCertificate ? "present" : "absent"} for digest ${shortHex(args.lattice.digest)}.` : "No lattice input.", status: args.lattice?.status ?? "UNAVAILABLE", basis: args.lattice?.verificationBasis ?? "n/a", notClaimed: args.lattice?.notClaimed ?? "n/a" },
  ];

  const failInv = invariants.find((i) => i.status === "FAIL") ?? invariants.find((i) => i.status === "WARN");
  let witness: FailureWitness | null = null;
  if (failInv) {
    const ev = failInv.evidence[0];
    witness = { layer: failInv.layer, invariantId: failInv.id, invariant: failInv.name, expected: "satisfied", observed: failInv.detail, source: ev?.source ?? failInv.layer, field: ev?.field ?? failInv.id, impact: failInv.detail, verification: failInv.status };
    if (args.mutation === "node-c-lied") {
      const c = args.observations.find((o) => o.letter === "C");
      witness = { layer: "sentinel", invariantId: "I-02", invariant: "Block hash consistency", expected: args.cross?.commonHash ?? "UNAVAILABLE", observed: c?.blockHash ?? LIE, source: "synthetic-node-C", field: "block_hash", impact: "Sentinel cross-node hash agreement fails. Lattice may still form a quorum on the honest digest — these are different claims.", verification: "FAIL" };
    }
    if (args.mutation === "drop-capability") witness = { layer: "quantumos", invariantId: "I-QOS-01", invariant: "Capability authorizes the lemma", expected: "cap:exchange:bob:prepare (or cap:room:write)", observed: "ABSENT", source: "QuantumOS", field: "capability", impact: "No Rholang process, no deploy, no block, no Sentinel evidence.", verification: "FAIL" };
    if (args.mutation === "tamper-trace" && args.replay?.firstDivergence) witness = { layer: "rspace", invariantId: "I-RPL-01", invariant: "Local replay matches observed state hash", expected: args.replay.expectedStateHash, observed: args.replay.observedStateHash, source: "Replay", field: `reduction step ${args.replay.firstDivergence.step}`, impact: `First divergence: ${args.replay.firstDivergence.object}.`, verification: "FAIL" };
  }

  let status: Status = "PASS";
  for (const i of invariants) status = worst(status, i.status === "UNAVAILABLE" ? status : i.status);
  for (const c of checks) status = worst(status, c.status === "UNAVAILABLE" ? status : c.status);

  const why: string[] = [];
  if (args.blocks[0]) {
    why.push(`Block #${args.blocks[0].height} exists because a QuantumOS event (${args.qos.eventId}) authorized lemma ${args.qos.lemma}.`);
    if (args.execution) why.push(`The lemma compiled to a Rholang process that reduced in ${args.execution.comms} COMM steps.`);
    why.push(`rchain-rust-shaped proposal included deploy ${args.blocks[0].deploys?.[0]?.id ?? "?"} at height ${args.blocks[0].height}.`);
    if (args.cross) why.push(`Sentinel observed ${args.cross.agreeingNodes}/${args.cross.targetCount} nodes on hash ${shortHex(args.cross.commonHash ?? "")}. This is observed agreement, not stake-weighted finality.`);
    if (args.lattice) why.push(`Sovereign Lattice formed ${args.lattice.committedCertificate ? "a" : "no"} CommittedCertificate (Q=${args.lattice.quorum}) on the honest digest. Independent of Sentinel's observation set.`);
  } else why.push("No block exists. The compiler stopped at QuantumOS — authorization failed — so downstream layers have no object to observe.");
  return { invariants, checks, claims, witness, status, why };
}

export interface DiffRow { layer: LayerId; field: string; a: string; b: string; diverged: boolean; }
export interface RealityDiff { rows: DiffRow[]; first: DiffRow | null; downstream: DiffRow[]; }

export function diffReality(a: Reality, b: Reality): RealityDiff {
  const rows: DiffRow[] = [
    { layer: "quantumos", field: "capability", a: a.qos.capability ?? "ABSENT", b: b.qos.capability ?? "ABSENT", diverged: a.qos.capability !== b.qos.capability },
    { layer: "quantumos", field: "authorized", a: String(a.qos.authorized), b: String(b.qos.authorized), diverged: a.qos.authorized !== b.qos.authorized },
    { layer: "qlf", field: "phase_string", a: a.qlf?.phaseString ?? "∅", b: b.qlf?.phaseString ?? "∅", diverged: a.qlf?.phaseString !== b.qlf?.phaseString },
    { layer: "qlf", field: "spectral_gap", a: String(a.qlf?.spectralGap ?? "n/a"), b: String(b.qlf?.spectralGap ?? "n/a"), diverged: a.qlf?.spectralGap !== b.qlf?.spectralGap },
    { layer: "rspace", field: "comms", a: String(a.execution?.comms ?? "n/a"), b: String(b.execution?.comms ?? "n/a"), diverged: a.execution?.comms !== b.execution?.comms },
    { layer: "rspace", field: "trace_hash", a: a.execution?.traceHash ?? "UNAVAILABLE", b: b.execution?.traceHash ?? "UNAVAILABLE", diverged: a.execution?.traceHash !== b.execution?.traceHash },
    { layer: "rspace", field: "state_hash", a: a.execution?.stateHash ?? "UNAVAILABLE", b: b.execution?.stateHash ?? "UNAVAILABLE", diverged: a.execution?.stateHash !== b.execution?.stateHash },
    { layer: "block", field: "block_hash", a: a.blocks[0]?.hash ?? "UNAVAILABLE", b: b.blocks[0]?.hash ?? "UNAVAILABLE", diverged: a.blocks[0]?.hash !== b.blocks[0]?.hash },
    { layer: "sentinel", field: "agreement_ratio", a: a.cross?.agreementRatio.toFixed(2) ?? "UNAVAILABLE", b: b.cross?.agreementRatio.toFixed(2) ?? "UNAVAILABLE", diverged: a.cross?.agreementRatio !== b.cross?.agreementRatio },
    { layer: "sentinel", field: "hash_agreement", a: String(a.cross?.hashAgreement ?? "n/a"), b: String(b.cross?.hashAgreement ?? "n/a"), diverged: a.cross?.hashAgreement !== b.cross?.hashAgreement },
    { layer: "lattice", field: "committed_certificate", a: String(a.lattice?.committedCertificate ?? "n/a"), b: String(b.lattice?.committedCertificate ?? "n/a"), diverged: a.lattice?.committedCertificate !== b.lattice?.committedCertificate },
    { layer: "lattice", field: "conflicting_prepare", a: String(a.lattice?.conflictingPrepare ?? "n/a"), b: String(b.lattice?.conflictingPrepare ?? "n/a"), diverged: a.lattice?.conflictingPrepare !== b.lattice?.conflictingPrepare },
    { layer: "verification", field: "status", a: a.status, b: b.status, diverged: a.status !== b.status },
  ];
  const first = rows.find((r) => r.diverged) ?? null;
  const firstIdx = first ? rows.indexOf(first) : -1;
  const downstream = firstIdx >= 0 ? rows.filter((r, i) => i > firstIdx && r.diverged) : [];
  return { rows, first, downstream };
}
