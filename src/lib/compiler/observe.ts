import { digest, hexPrefixed, sha256, shortHex } from "./hash";
import type { EvidenceRef, Status } from "./types";

export interface Deploy {
  id: string;
  termHash: string;
  deployer: string;
  phloLimit: number;
  phloPrice: number;
  cost: number;
  shard: string;
}

export interface Block {
  height: number;
  hash: string;
  parentHash: string;
  proposer: string;
  shard: string;
  deploys: Deploy[];
  justifications: string[];
  postStateHash: string;
  signature: string;
  timestamp: string;
}

export interface NodeObservation {
  nodeId: string;
  letter: string;
  networkId: string;
  shardId: string;
  reachable: boolean;
  httpStatus: number | null;
  latencyMs: number | null;
  probeIntegrity: boolean;
  ready: boolean;
  validatorState: string;
  validatorId: string;
  currentEpoch: number;
  lastFinalizedBlockNumber: number;
  latestBlockNumber: number;
  blockHash: string;
  parentHash: string;
  proposer: string;
  signaturePresent: boolean;
  justificationPresent: boolean;
  justificationCount: number;
  malformedJustification: boolean;
  duplicateValidator: boolean;
  payloadSha256: string;
  fullBlockAvailable: boolean;
  canonicalConsistent: boolean;
  observedStake: number;
  bondCount: number;
  peerCount: number;
}

export interface CrossNodeReport {
  targetCount: number;
  reachableCount: number;
  agreeingNodes: number;
  quorumRequired: number;
  quorumObserved: boolean;
  agreementRatio: number;
  commonHeight: number | null;
  commonHash: string | null;
  heightAgreement: boolean;
  hashAgreement: boolean;
  conflictingNodes: number;
  status: Status;
  verificationBasis: string;
}

export interface CasperEvidence {
  evidenceAvailable: boolean;
  protocolBlockShape: boolean;
  validatorIdentityPresent: boolean;
  stakeWeightPresent: boolean;
  bondCount: number;
  totalObservedStake: number;
  duplicateValidatorCount: number;
  bondStructureValid: boolean;
  justificationPresent: boolean;
  justificationCount: number;
  justificationStructureValid: boolean;
  malformedJustificationCount: number;
  equivocationSignal: boolean;
  recognizedFields: string[];
  status: Status;
  verificationBasis: string;
}

export type PbftPhase = "PrePrepare" | "Prepare" | "Commit";

export interface LatticeVote {
  replica: string;
  phase: PbftPhase;
  view: number;
  seq: number;
  digest: string;
  senderId: number;
  validatorId: string;
  signature: string;
  accepted: boolean;
  rejectReason?: string;
}

export interface LatticeReport {
  n: number;
  f: number;
  quorum: number;
  view: number;
  seq: number;
  primary: string;
  digest: string;
  votes: LatticeVote[];
  preparedCount: number;
  committedCount: number;
  preparedCertificate: boolean;
  committedCertificate: boolean;
  conflictingPrepare: boolean;
  duplicateValidatorCount: number;
  distinctPrepareValidators: number;
  distinctCommitValidators: number;
  status: Status;
  verificationBasis: string;
  notClaimed: string;
}

const NODES = [
  { letter: "A", id: "synthetic-node-A", validatorId: "val_0a17", stake: 250_000 },
  { letter: "B", id: "synthetic-node-B", validatorId: "val_0b42", stake: 250_000 },
  { letter: "C", id: "synthetic-node-C", validatorId: "val_0c88", stake: 250_000 },
  { letter: "D", id: "synthetic-node-D", validatorId: "val_0d05", stake: 250_000 },
] as const;

export function proposeBlock(args: {
  height: number;
  parentHash: string;
  proposer: string;
  shard: string;
  deploys: Deploy[];
  postStateHash: string;
  timestamp: string;
}): Block {
  const justifications = [args.parentHash];
  const material = [
    "block-v2",
    args.height,
    args.parentHash,
    args.proposer,
    args.shard,
    args.postStateHash,
    args.timestamp,
    justifications,
    args.deploys.map((d) => ({
      id: d.id,
      termHash: d.termHash,
      deployer: d.deployer,
      phloLimit: d.phloLimit,
      phloPrice: d.phloPrice,
      cost: d.cost,
      shard: d.shard,
    })),
  ];
  const hash = hexPrefixed(digest(material));
  return {
    height: args.height,
    hash,
    parentHash: args.parentHash,
    proposer: args.proposer,
    shard: args.shard,
    deploys: args.deploys,
    justifications,
    postStateHash: args.postStateHash,
    signature: `bls:${shortHex(digest(["sig", hash]), 8, 8).slice(2)}`,
    timestamp: args.timestamp,
  };
}

export function observeBlock(
  block: Block,
  opts?: {
    lieNode?: string;
    lieHash?: string;
    unreachable?: string;
    dropJustification?: string;
    duplicateProposer?: { from: string; onto: string };
    missingPayload?: string;
    canonicalBreak?: string;
  },
): NodeObservation[] {
  const payload = hexPrefixed(
    sha256(
      JSON.stringify({
        height: block.height,
        hash: block.hash,
        parentHash: block.parentHash,
        proposer: block.proposer,
        shard: block.shard,
        deploys: block.deploys,
        justifications: block.justifications,
        postStateHash: block.postStateHash,
        timestamp: block.timestamp,
      }),
    ),
  );
  return NODES.map((n, i) => {
    const obs: NodeObservation = {
      nodeId: n.id,
      letter: n.letter,
      networkId: "synthetic-testnet",
      shardId: block.shard,
      reachable: true,
      httpStatus: 200,
      latencyMs: 41 + i,
      probeIntegrity: true,
      ready: true,
      validatorState: "bonded",
      validatorId: n.validatorId,
      currentEpoch: 913,
      lastFinalizedBlockNumber: block.height,
      latestBlockNumber: block.height + 3,
      blockHash: block.hash,
      parentHash: block.parentHash,
      proposer: block.proposer,
      signaturePresent: true,
      justificationPresent: block.justifications.length > 0,
      justificationCount: block.justifications.length,
      malformedJustification: false,
      duplicateValidator: false,
      payloadSha256: payload,
      fullBlockAvailable: true,
      canonicalConsistent: true,
      observedStake: n.stake,
      bondCount: 4,
      peerCount: 3,
    };
    if (opts?.lieNode === n.letter && opts.lieHash) {
      obs.blockHash = opts.lieHash;
      obs.canonicalConsistent = false;
    }
    if (opts?.unreachable === n.letter) {
      obs.reachable = false;
      obs.httpStatus = null;
      obs.latencyMs = null;
      obs.probeIntegrity = false;
    }
    if (opts?.dropJustification === n.letter) {
      obs.justificationPresent = false;
      obs.justificationCount = 0;
    }
    if (opts?.duplicateProposer?.from === n.letter) {
      const onto = NODES.find((x) => x.letter === opts.duplicateProposer!.onto);
      if (onto) {
        obs.validatorId = onto.validatorId;
        obs.duplicateValidator = true;
      }
    }
    if (opts?.missingPayload === n.letter) obs.fullBlockAvailable = false;
    if (opts?.canonicalBreak === n.letter) obs.canonicalConsistent = false;
    return obs;
  });
}

export function crossNode(obs: NodeObservation[]): CrossNodeReport {
  const total = obs.length;
  const reachable = obs.filter((o) => o.reachable);
  const heights = reachable.map((o) => o.lastFinalizedBlockNumber);
  const hashes = reachable.map((o) => o.blockHash);
  const commonHeight = heights[0] ?? null;
  const commonHash = hashes[0] ?? null;
  const heightMatches = heights.filter((h) => h === commonHeight).length;
  const hashMatches = hashes.filter((h) => h === commonHash).length;
  const agreeing = reachable.filter(
    (o) => o.lastFinalizedBlockNumber === commonHeight && o.blockHash === commonHash,
  ).length;
  const heightAgreement = heightMatches === reachable.length && reachable.length > 0;
  const hashAgreement = hashMatches === reachable.length && reachable.length > 0;
  const quorumRequired = Math.floor((total * 2) / 3) + 1;
  const quorumObserved = agreeing >= quorumRequired;
  const ratio = total === 0 ? 0 : Math.round((agreeing / total) * 100) / 100;
  let status: Status = "PASS";
  if (!quorumObserved || !heightAgreement || !hashAgreement) status = "FAIL";
  else if (reachable.length < total) status = "WARN";
  return {
    targetCount: total,
    reachableCount: reachable.length,
    agreeingNodes: agreeing,
    quorumRequired,
    agreementRatio: ratio,
    commonHeight,
    commonHash,
    heightAgreement,
    hashAgreement,
    conflictingNodes: reachable.length - agreeing,
    status,
    verificationBasis:
      "Observed node-count agreement across configured synthetic RNodes. Not a stake-weighted Casper proof.",
  };
}

export function casperInventory(obs: NodeObservation[], block: Block): CasperEvidence {
  const reachable = obs.filter((o) => o.reachable);
  const validators = new Map<string, number>();
  for (const o of reachable) validators.set(o.validatorId, (validators.get(o.validatorId) ?? 0) + o.observedStake);
  const duplicateValidatorCount = reachable.length - validators.size;
  const malformed = reachable.filter((o) => o.malformedJustification).length;
  const missingJ = reachable.filter((o) => !o.justificationPresent || o.justificationCount === 0).length;
  const missingSignature = reachable.filter((o) => !o.signaturePresent).length;
  const missingPayload = reachable.filter((o) => !o.fullBlockAvailable).length;
  const canonicalBreak = reachable.filter((o) => !o.canonicalConsistent).length;
  const stake = [...validators.values()].reduce((s, value) => s + value, 0);
  const ok = duplicateValidatorCount === 0 && malformed === 0 && missingJ === 0 && missingSignature === 0 && missingPayload === 0 && canonicalBreak === 0;
  return {
    evidenceAvailable: reachable.length > 0,
    protocolBlockShape: Boolean(block.hash && block.parentHash && block.signature),
    validatorIdentityPresent: reachable.every((o) => Boolean(o.validatorId)),
    stakeWeightPresent: reachable.every((o) => Number.isFinite(o.observedStake) && o.observedStake >= 0),
    bondCount: validators.size,
    totalObservedStake: stake,
    duplicateValidatorCount,
    bondStructureValid: duplicateValidatorCount === 0,
    justificationPresent: missingJ === 0,
    justificationCount: block.justifications.length,
    justificationStructureValid: malformed === 0,
    malformedJustificationCount: malformed,
    equivocationSignal: duplicateValidatorCount > 0,
    recognizedFields: ["blockHash", "parentHash", "proposer", "validatorId", "justifications", "bonds", "signature"],
    status: ok ? "PASS" : "FAIL",
    verificationBasis:
      "Protocol-shaped Casper evidence inventory. Fields are structurally checked against the synthetic fixture, not authenticated against a live RNode schema or cryptographically verified.",
  };
}

export function latticeAnalyze(block: Block, obs: NodeObservation[]): LatticeReport {
  const N = 4;
  const f = 1;
  const Q = 2 * f + 1;
  const view = 0;
  const seq = block.height;
  const primary = "replica-A";
  const honest = block.hash;
  const votes: LatticeVote[] = [];
  const acceptedValidatorsByPhase: Record<PbftPhase, Set<string>> = {
    PrePrepare: new Set(),
    Prepare: new Set(),
    Commit: new Set(),
  };

  const replicas = ["A", "B", "C", "D"] as const;
  replicas.forEach((letter, senderId) => {
    const o = obs.find((x) => x.letter === letter);
    if (!o) return;
    const digestVote = o.reachable ? o.blockHash : honest;
    const conflicting = digestVote !== honest;
    const duplicateIdentity = obs.some(
      (candidate) => candidate.reachable && candidate.nodeId !== o.nodeId && candidate.validatorId === o.validatorId,
    );
    const mk = (phase: PbftPhase, accepted: boolean, reason?: string): LatticeVote => ({
      replica: `replica-${letter}`,
      phase,
      view,
      seq,
      digest: conflicting && phase !== "PrePrepare" ? digestVote : honest,
      senderId,
      validatorId: o.validatorId,
      signature: `bls:${letter.toLowerCase()}:${shortHex(digest([phase, letter, digestVote]), 4, 4).slice(2)}`,
      accepted,
      rejectReason: reason,
    });
    const accept = (phase: PbftPhase) => {
      if (!o.reachable) {
        votes.push(mk(phase, false, "replica unreachable — vote absent"));
        return;
      }
      if (duplicateIdentity) {
        votes.push(mk(phase, false, "duplicate validator identity — vote excluded from certificate"));
        return;
      }
      if (conflicting && phase !== "PrePrepare") {
        votes.push(mk(phase, false, "conflicting digest for (view, seq) — dropped"));
        return;
      }
      if (acceptedValidatorsByPhase[phase].has(o.validatorId)) {
        votes.push(mk(phase, false, "duplicate validator vote for certificate — excluded"));
        return;
      }
      acceptedValidatorsByPhase[phase].add(o.validatorId);
      votes.push(mk(phase, true));
    };

    if (letter === "A") accept("PrePrepare");
    accept("Prepare");
    if (conflicting) {
      votes.push(mk("Commit", false, "no prepared certificate for conflicting digest"));
    } else {
      accept("Commit");
    }
  });

  const preparedValidators = new Set(
    votes.filter((v) => v.phase === "Prepare" && v.accepted && v.digest === honest).map((v) => v.validatorId),
  );
  const committedValidators = new Set(
    votes.filter((v) => v.phase === "Commit" && v.accepted && v.digest === honest).map((v) => v.validatorId),
  );
  const preparedCount = preparedValidators.size;
  const committedCount = committedValidators.size;
  const conflictingPrepare = votes.some((v) => v.phase === "Prepare" && v.digest !== honest && !v.accepted);
  const duplicateValidatorCount = obs.filter((o) => o.reachable).length - new Set(obs.filter((o) => o.reachable).map((o) => o.validatorId)).size;
  const preparedCertificate = preparedCount >= Q;
  const committedCertificate = committedCount >= Q;
  const status: Status = duplicateValidatorCount > 0
    ? "FAIL"
    : committedCertificate
      ? "PASS"
      : preparedCertificate
        ? "WARN"
        : "FAIL";

  return {
    n: N,
    f,
    quorum: Q,
    view,
    seq,
    primary,
    digest: honest,
    votes,
    preparedCount,
    committedCount,
    preparedCertificate,
    committedCertificate,
    conflictingPrepare,
    duplicateValidatorCount,
    distinctPrepareValidators: preparedValidators.size,
    distinctCommitValidators: committedValidators.size,
    status,
    verificationBasis: `PBFT-shaped analysis on N=${N}, f=${f}, Q=${Q}. Certificates count distinct validator identities only; duplicate identities are excluded.`,
    notClaimed:
      "Sovereign Lattice does not claim that RChain Casper is PBFT, nor that these BLS placeholders are pairing-verified.",
  };
}

export function observationEvidence(obs: NodeObservation[]): EvidenceRef[] {
  return obs.map((o) => ({
    source: "RNodeObservation",
    field: `${o.nodeId}.block_hash`,
    value: o.reachable ? o.blockHash : "UNAVAILABLE",
  }));
}
