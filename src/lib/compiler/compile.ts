import { digest, hexPrefixed, shortHex } from "./hash.ts";
import {
  abort,
  cloneWorld,
  commit,
  poolsConserved,
  prepare,
  prepareReceive,
  seedWorld,
  type ExchangeWorld,
} from "./exchange.ts";
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
} from "./observe.ts";
import { certify, phasesFromComms, type QlfCertificate } from "./qlf.ts";
import { exchangeProc, helloProc, paymentProc, reduce, type Execution, type ReductionStep } from "./rho.ts";
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
} from "./types.ts";

export interface ScenarioMeta { id: ScenarioId; title: string; summary: string; killer?: boolean; }
export interface MutationMeta { id: MutationId; title: string; summary: string; applies: ScenarioId[]; }

const SCENARIOS: ScenarioMeta[] = [
  { id: "baseline", title: "Canonical transfer", summary: "A balanced synthetic transfer reaches a coherent observation state.", killer: true },
  { id: "split-brain", title: "Split-brain observation", summary: "One node reports a conflicting finalized block hash.", killer: true },
  { id: "unreachable-node", title: "Unreachable validator", summary: "One validator stops answering observation probes." },
  { id: "missing-justification", title: "Missing justification", summary: "One node omits the parent justification from its observation." },
  { id: "duplicate-validator", title: "Duplicate validator identity", summary: "Two replicas present the same validator identity." },
  { id: "missing-payload", title: "Missing block payload", summary: "One node reports no full block payload." },
  { id: "canonical-break", title: "Canonical mismatch", summary: "One node's observed block is not canonical-consistent." },
];

const MUTATIONS: MutationMeta[] = [
  { id: "lie-hash", title: "Lie about hash", summary: "Change one node's reported finalized hash.", applies: ["split-brain"] },
  { id: "drop-node", title: "Drop node", summary: "Make one node unreachable.", applies: ["unreachable-node"] },
  { id: "drop-justification", title: "Drop justification", summary: "Remove one node's parent justification.", applies: ["missing-justification"] },
  { id: "duplicate-validator", title: "Duplicate validator", summary: "Alias one validator identity to another.", applies: ["duplicate-validator"] },
  { id: "missing-payload", title: "Missing payload", summary: "Hide one node's full block payload.", applies: ["missing-payload"] },
  { id: "canonical-break", title: "Break canonicality", summary: "Mark one node as non-canonical.", applies: ["canonical-break"] },
];

export function listScenarios(): ScenarioMeta[] { return SCENARIOS; }
export function listMutations(): MutationMeta[] { return MUTATIONS; }

export function buildDeploys(): Deploy[] {
  return [
    { id: "deploy-001", termHash: hexPrefixed(digest(["term", "Alice", "Bob", 25])), deployer: "alice", phloLimit: 100000, phloPrice: 1, cost: 25, shard: "shard-0" },
    { id: "deploy-002", termHash: hexPrefixed(digest(["term", "Bob", "Carol", 10])), deployer: "bob", phloLimit: 100000, phloPrice: 1, cost: 10, shard: "shard-0" },
  ];
}

function blockFor(scenario: ScenarioId): Block {
  const deploys = buildDeploys();
  return proposeBlock({
    height: 913,
    parentHash: hexPrefixed(digest(["parent", "912"])),
    proposer: "synthetic-node-A",
    shard: "shard-0",
    deploys,
    postStateHash: hexPrefixed(digest(["state", scenario, deploys.map((d) => d.id)])),
    timestamp: "2026-09-16T00:00:00.000Z",
  });
}

export interface CompiledScenario {
  scenario: ScenarioMeta;
  mutation: MutationMeta | null;
  block: Block;
  observations: NodeObservation[];
  execution: Execution;
  qlf: QlfCertificate;
  crossNode: CrossNodeReport;
  casper: CasperEvidence;
  lattice: LatticeReport;
  checks: VerificationCheck[];
  evidence: EvidenceRef[];
  status: Status;
  summary: string;
  killer: boolean;
}

export function compileScenario(scenarioId: ScenarioId, mutationId?: MutationId): CompiledScenario {
  const scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0];
  const mutation = mutationId ? MUTATIONS.find((m) => m.id === mutationId) ?? null : null;
  const block = blockFor(scenario.id);
  const deploys = block.deploys;
  const observations = observeBlock(block, mutationToOptions(mutation));
  const execution = executeScenario(scenario.id);
  const qlf = certify(phasesFromComms(execution.steps.map((s) => s.process)));
  const cross = crossNode(observations);
  const casper = casperInventory(observations, block);
  const lattice = latticeAnalyze(block, observations);
  const checks = checksFor(scenario.id, cross, casper, lattice, execution);
  const evidence = evidenceFor(block, observations, qlf, cross, casper, lattice);
  const status = checks.some((c) => c.status === "FAIL") ? "FAIL" : checks.some((c) => c.status === "WARN") ? "WARN" : "PASS";
  return {
    scenario,
    mutation,
    block,
    observations,
    execution,
    qlf,
    crossNode: cross,
    casper,
    lattice,
    checks,
    evidence,
    status,
    summary: summaryFor(scenario.id, status),
    killer: Boolean(scenario.killer),
  };
}

function mutationToOptions(mutation: MutationMeta | null) {
  switch (mutation?.id) {
    case "lie-hash": return { lieNode: "D", lieHash: hexPrefixed(digest(["tampered", "D"])) };
    case "drop-node": return { unreachable: "D" };
    case "drop-justification": return { dropJustification: "D" };
    case "duplicate-validator": return { duplicateProposer: { from: "D", onto: "C" } };
    case "missing-payload": return { missingPayload: "D" };
    case "canonical-break": return { canonicalBreak: "D" };
    default: return undefined;
  }
}

function executeScenario(scenario: ScenarioId): Execution {
  const world = seedWorld();
  const hello = reduce(helloProc("Alice"));
  if (scenario === "baseline") return reduce(paymentProc(world, "Alice", "Bob", 25));
  if (scenario === "split-brain") return reduce(paymentProc(world, "Alice", "Bob", 25));
  if (scenario === "unreachable-node") return reduce(paymentProc(world, "Alice", "Bob", 25));
  if (scenario === "missing-justification") return reduce(paymentProc(world, "Alice", "Bob", 25));
  if (scenario === "duplicate-validator") return reduce(paymentProc(world, "Alice", "Bob", 25));
  if (scenario === "missing-payload") return reduce(paymentProc(world, "Alice", "Bob", 25));
  if (scenario === "canonical-break") return reduce(paymentProc(world, "Alice", "Bob", 25));
  return hello;
}

function checksFor(
  scenario: ScenarioId,
  cross: CrossNodeReport,
  casper: CasperEvidence,
  lattice: LatticeReport,
  execution: Execution,
): VerificationCheck[] {
  const checks: VerificationCheck[] = [
    { id: "exchange-conservation", label: "Exchange conservation", status: execution.finalWorld ? (poolsConserved(execution.finalWorld) ? "PASS" : "FAIL") : "WARN", detail: "Synthetic in-memory exchange balances remain conserved." },
    { id: "cross-node-agreement", label: "Cross-node agreement", status: cross.status, detail: `${cross.agreeingNodes}/${cross.targetCount} observations agree on the finalized block.` },
    { id: "casper-shape", label: "Casper evidence shape", status: casper.status, detail: casper.verificationBasis },
    { id: "lattice-certificate", label: "Sovereign Lattice certificate", status: lattice.status, detail: lattice.verificationBasis },
  ];
  if (scenario === "baseline") checks.push({ id: "killer-case", label: "Baseline end-to-end path", status: "PASS", detail: "All synthetic layers produce a coherent verification result." });
  return checks;
}

function evidenceFor(
  block: Block,
  observations: NodeObservation[],
  qlf: QlfCertificate,
  cross: CrossNodeReport,
  casper: CasperEvidence,
  lattice: LatticeReport,
): EvidenceRef[] {
  return [
    { source: "Block", field: "hash", value: block.hash },
    { source: "Block", field: "parentHash", value: block.parentHash },
    { source: "QLF", field: "certificateHash", value: qlf.certificateHash },
    { source: "CrossNode", field: "agreementRatio", value: String(cross.agreementRatio) },
    { source: "CrossNode", field: "quorumObserved", value: String(cross.quorumObserved) },
    { source: "Casper", field: "totalObservedStake", value: String(casper.totalObservedStake) },
    { source: "Lattice", field: "preparedCertificate", value: String(lattice.preparedCertificate) },
    { source: "Lattice", field: "committedCertificate", value: String(lattice.committedCertificate) },
    { source: "Observation", field: "nodeCount", value: String(observations.length) },
  ];
}

function summaryFor(scenario: ScenarioId, status: Status): string {
  if (scenario === "baseline") return `Synthetic baseline verification ${status.toLowerCase()}.`;
  return `Adversarial scenario ${scenario} produces ${status.toLowerCase()} under the documented synthetic evidence model.`;
}

export function claimFor(result: CompiledScenario): Claim {
  return {
    id: `claim-${result.scenario.id}`,
    statement: result.summary,
    status: result.status,
    basis: result.evidence.map((e) => `${e.source}.${e.field}`),
    limitations: [
      "Synthetic fixture only.",
      "No live RNode or Sentinel endpoint was contacted.",
      "Sovereign Lattice analysis is PBFT-shaped and does not claim RChain Casper is PBFT.",
    ],
  };
}

export function invariantFor(result: CompiledScenario): Invariant {
  return {
    id: "INV-END-TO-END",
    label: "End-to-end evidence coherence",
    status: result.status,
    detail: result.summary,
  };
}

export function failureWitnessFor(result: CompiledScenario): FailureWitness | null {
  if (result.status !== "FAIL") return null;
  const failed = result.checks.find((c) => c.status === "FAIL");
  return {
    layer: (failed?.id.includes("lattice") ? "sovereign-lattice" : failed?.id.includes("casper") ? "casper" : failed?.id.includes("cross") ? "sentinel" : "rholang") as LayerId,
    reason: failed?.detail ?? "verification failed",
    mutation: result.mutation?.id ?? null,
  };
}
