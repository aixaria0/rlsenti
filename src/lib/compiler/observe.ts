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
  malformedJustificationCount: number;
  missingJustificationCount: number;
  missingSignatureCount: number;
  canonicalMismatchCount: number;
  verificationBasis: string;
}

export interface LatticeReport {
  validatorCount: number;
  uniqueValidatorCount: number;
  duplicateValidatorCount: number;
  quorumRequired: number;
  quorumObserved: boolean;
  conflictingNodes: number;
  status: Status;
  verificationBasis: string;
}

export interface CompilerObservation {
  crossNode: CrossNodeReport;
  casper: CasperEvidence;
  lattice: LatticeReport;
}

const NODES = [
  { letter: "A", validatorId: "validator-A", observedStake: 100, bondCount: 1, peerCount: 3 },
  { letter: "B", validatorId: "validator-B", observedStake: 100, bondCount: 1, peerCount: 3 },
  { letter: "C", validatorId: "validator-C", observedStake: 100, bondCount: 1, peerCount: 3 },
  { letter: "D", validatorId: "validator-D", observedStake: 100, bondCount: 1, peerCount: 3 },
];

export type ObserveMutation = {
  lieHash?: string;
  unreachable?: string;
  dropJustification?: string;
  duplicateProposer?: { from: string; onto: string };
  missingPayload?: string;
  canonicalBreak?: string;
};

export function observeNodes(block: Block, opts?: ObserveMutation): NodeObservation[] {
  return NODES.map((n) => {
    const obs: NodeObservation = {
      nodeId: `rnode-${n.letter.toLowerCase()}`,
      letter: n.letter,
      networkId: "rlsenti-synthetic",
      shardId: block.shard,
      reachable: true,
      httpStatus: 200,
      latencyMs: 12,
      probeIntegrity: true,
      ready: true,
      validatorState: "ACTIVE",
      validatorId: n.validatorId,
      currentEpoch: 7,
      lastFinalizedBlockNumber: block.height,
      latestBlockNumber: block.height,
      blockHash: block.hash,
      parentHash: block.parentHash,
      proposer: block.proposer,
      signaturePresent: Boolean(block.signature),
      justificationPresent: block.justifications.length > 0,
      justificationCount: block.justifications.length,
      malformedJustification: false,
      duplicateValidator: false,
      payloadSha256: sha256(JSON.stringify(block.deploys)),
      fullBlockAvailable: true,
      canonicalConsistent: true,
      observedStake: n.observedStake,
      bondCount: n.bondCount,
      peerCount: n.peerCount,
    };
    if (opts?.lieHash === n.letter) {
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
    quorumObserved,
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
  const canonicalMismatch = reachable.filter((o) => !o.canonicalConsistent).length;
  return {
    evidenceAvailable: reachable.length > 0,
    protocolBlockShape: Boolean(block.hash && block.parentHash && block.proposer),
    validatorIdentityPresent: validators.size > 0,
    stakeWeightPresent: reachable.every((o) => o.observedStake >= 0),
    bondCount: reachable.reduce((sum, o) => sum + o.bondCount, 0),
    totalObservedStake: reachable.reduce((sum, o) => sum + o.observedStake, 0),
    duplicateValidatorCount,
    malformedJustificationCount: malformed,
    missingJustificationCount: missingJ,
    missingSignatureCount: missingSignature,
    canonicalMismatchCount: canonicalMismatch,
    verificationBasis:
      "Synthetic node observations and block evidence only; this does not prove live Casper finality.",
  };
}
