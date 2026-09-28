export interface RepairPropagationEnvelope {
  schema: "causal-assurance-repair-propagation/v1";
  repairProblemId: string;
  repairArtifactDigest: string;
  nativeReceiptDigest: string;
  nativeBindingDigest: string;
  upstreamRepository: string;
  upstreamCommit: string;
  repairAction: string;
  nativeReplayVerified: boolean;
  claimBoundary: string;
}

export interface RepairPropagationInspection {
  accepted: boolean;
  reasons: string[];
  claimBoundary: string;
}

const SHA256 = /^sha256:[0-9a-f]{64}$/;

export function inspectRepairPropagation(
  envelope: RepairPropagationEnvelope,
): RepairPropagationInspection {
  const reasons: string[] = [];
  if (envelope.schema !== "causal-assurance-repair-propagation/v1") {
    reasons.push("unsupported propagation schema");
  }
  for (const [name, digest] of [
    ["repairArtifactDigest", envelope.repairArtifactDigest],
    ["nativeReceiptDigest", envelope.nativeReceiptDigest],
    ["nativeBindingDigest", envelope.nativeBindingDigest],
  ] as const) {
    if (!SHA256.test(digest)) reasons.push(`${name} is not a canonical sha256 digest`);
  }
  if (
    !envelope.repairProblemId ||
    !envelope.upstreamRepository ||
    !envelope.upstreamCommit ||
    !envelope.repairAction
  ) {
    reasons.push("required provenance field is empty");
  }
  if (!envelope.nativeReplayVerified) reasons.push("native replay is not verified");

  return {
    accepted: reasons.length === 0,
    reasons,
    claimBoundary:
      "rlsenti inspection preserves the upstream claim boundary; transport acceptance does not promote bounded repair evidence into protocol safety.",
  };
}
