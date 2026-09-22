import { sha256 } from "./hash.ts";

/**
 * Transport/integrity adapter for an externally generated M27 CBC research report.
 * A matching content digest does not authenticate the producer or prove finality.
 * This is a real data-import path, NOT a call to compile()'s synthetic fixture.
 */
export const CBC_WITNESS_SCHEMA = "aria-cbc-witness/v1" as const;
export const CBC_WORKBENCH_SCHEMA = "aria-cbc-workbench-receipt/v1" as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (isRecord(value)) {
    const keys = Object.keys(value).sort();
    if (keys.some((key) => key === "__proto__" || key === "constructor" || key === "prototype")) {
      throw new Error("Unsafe witness key");
    }
    return "{" + keys.map((key) => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  }
  throw new Error("Witness contains unsupported JSON value");
}

function requireHex64(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) throw new Error("Invalid " + label);
}

export interface CbcWitnessReceipt {
  schema: typeof CBC_WORKBENCH_SCHEMA;
  source: {
    repository: string;
    commit: string;
    upstreamRevision: string;
    reportedMilestone: "M27";
  };
  transport: {
    payloadSha256: string;
    integrity: "MATCH";
    authenticatedProducer: false;
  };
  witness: {
    justificationIds: string[];
    senderIds: string[];
    distanceFromControl: number;
    classification: "UNDER_CARDINALITY";
    sourceReportedReachable: boolean;
    sourceReportedFinalized: boolean;
  };
  provenance: {
    eventId: string;
    sourceReportDigest: string;
    workbenchReceiptDigest: string;
    sourceStatus: "RECEIVED_EXTERNAL_RESEARCH";
  };
  claimBoundary: string;
}

/** Accept only the exact versioned shape produced by the pinned research export. */
export function receiveCbcWitness(input: unknown): CbcWitnessReceipt {
  if (!isRecord(input) || input.schema !== CBC_WITNESS_SCHEMA) throw new Error("Unknown CBC witness schema");
  const source = input.source;
  const report = input.report;
  if (!isRecord(source) || !isRecord(report)) throw new Error("Missing source/report");
  if (source.repository !== "aixaria0/RCHAIN-COMPLIER" ||
      source.commit !== "2d2c3d879b1a078693c8551385efb54a811d7172" ||
      source.upstreamRevision !== "rchain-community/rchain-rust@d92f0787a6096cd6d79864ec2d7c1dd9b6912d0b" ||
      report.milestone !== "M27" || report.upstreamRevision !== source.upstreamRevision) {
    throw new Error("Unsupported CBC source pin");
  }
  requireHex64(source.commit, "source commit");
  requireHex64(report.digest, "report digest");
  requireHex64(input.payloadSha256, "payloadSha256");
  if (canonical({ schema: input.schema, source, report }).length > 1_000_000) {
    throw new Error("Witness exceeds size limit");
  }
  if (sha256(canonical({ schema: input.schema, source, report })) !== input.payloadSha256) {
    throw new Error("CBC witness transport digest mismatch");
  }
  if (report.deterministic !== true || report.minimalFinalizingDistance !== 1 ||
      !Array.isArray(report.minimalFinalizingWitnesses) || report.minimalFinalizingWitnesses.length === 0) {
    throw new Error("Unsupported M27 report structure");
  }
  const witness = report.minimalFinalizingWitnesses[0];
  if (!isRecord(witness) || !Array.isArray(witness.justifications) ||
      !Array.isArray(witness.minimumMessageSenders) ||
      witness.justifications.length !== 4 || witness.minimumMessageSenders.length !== 4 ||
      !witness.justifications.every((id: unknown) => typeof id === "string" && /^[a-d]3$/.test(id)) ||
      !witness.minimumMessageSenders.every((id: unknown) => typeof id === "string" && /^v[0-3]$/.test(id)) ||
      new Set(witness.minimumMessageSenders).size !== 3 ||
      witness.distanceFromControl !== 1 || witness.distinctMinimumSenders !== 3 ||
      witness.classification !== "UNDER_CARDINALITY" ||
      witness.reachable !== true || witness.finalized !== true ||
      witness.currentCountGate !== true || witness.senderCoverage !== false) {
    throw new Error("Unsupported minimum-witness structure");
  }
  // These are source-reported properties; the adapter verifies bytes/shape, not the Rust Finalizer.
  const receiptBody = {
    schema: CBC_WORKBENCH_SCHEMA,
    source: {
      repository: source.repository as string,
      commit: source.commit as string,
      upstreamRevision: source.upstreamRevision as string,
      reportedMilestone: "M27" as const,
    },
    transport: {
      payloadSha256: input.payloadSha256,
      integrity: "MATCH" as const,
      authenticatedProducer: false as const,
    },
    witness: {
      justificationIds: [...witness.justifications] as string[],
      senderIds: [...witness.minimumMessageSenders] as string[],
      distanceFromControl: witness.distanceFromControl as number,
      classification: "UNDER_CARDINALITY" as const,
      sourceReportedReachable: true as const,
      sourceReportedFinalized: true as const,
    },
    provenance: {
      eventId: "cbc:" + input.payloadSha256.slice(0, 24),
      sourceReportDigest: report.digest as string,
      sourceStatus: "RECEIVED_EXTERNAL_RESEARCH" as const,
    },
    claimBoundary: "Imported pinned M27 research output. Transport integrity and shape checked only; source identity is declared, not authenticated. Reachability/finalization are source-reported under bounded fixture; not live-network safety or independently verified Casper finality.",
  };
  return {
    ...receiptBody,
    provenance: {
      ...receiptBody.provenance,
      workbenchReceiptDigest: sha256(canonical(receiptBody)),
    },
  };
}

export function verifyCbcWorkbenchReceipt(receipt: unknown): boolean {
  if (!isRecord(receipt) || !isRecord(receipt.provenance)) return false;
  const { workbenchReceiptDigest, ...provenance } = receipt.provenance;
  if (typeof workbenchReceiptDigest !== "string") return false;
  const { provenance: _discard, ...body } = receipt;
  try { return sha256(canonical({ ...body, provenance })) === workbenchReceiptDigest; }
  catch { return false; }
}
