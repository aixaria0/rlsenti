export type AssuranceVerdict = "PASS" | "FAIL" | "BLOCKED" | "NOT_TESTED" | "INCONCLUSIVE";
export type AssurancePlane = "POSSIBILITY" | "REALITY" | "CONFORMANCE" | "RECOVERY" | "SUPPLY_CHAIN";

export interface AssuranceCheckView {
  id: string; plane: AssurancePlane; state: AssuranceVerdict; critical: boolean;
  description: string; evidence: string[];
}
export interface AssuranceRecordView {
  id: string; label: string; source: string; sourceClass: string; state: string;
  digest: string; integrityValid: boolean;
}
export interface AssuranceCertificateView {
  schema: "rchain-assurance-certificate/v1" | "causal-assurance-certificate/v1";
  id: string; issuedAt: string; status: AssuranceVerdict;
  records: AssuranceRecordView[]; checks: AssuranceCheckView[];
  integrity: { algorithm: "SHA-256"; certificateDigest: string };
}
export interface AssuranceWorkbenchModel {
  certificate: AssuranceCertificateView;
  planes: Record<AssurancePlane, AssuranceCheckView[]>;
  criticalFailures: AssuranceCheckView[];
  criticalBlocked: AssuranceCheckView[];
  evidenceDigests: string[];
}

export function projectAssuranceCertificate(certificate: AssuranceCertificateView): AssuranceWorkbenchModel {
  const planes: AssuranceWorkbenchModel["planes"] = {
    POSSIBILITY: [],
    REALITY: [],
    CONFORMANCE: [],
    RECOVERY: [],
    SUPPLY_CHAIN: [],
  };
  for (const check of certificate.checks) planes[check.plane].push(check);
  return {
    certificate,
    planes,
    criticalFailures: certificate.checks.filter((check) => check.critical && check.state === "FAIL"),
    criticalBlocked: certificate.checks.filter(
      (check) =>
        check.critical
        && (check.state === "BLOCKED" || check.state === "NOT_TESTED" || check.state === "INCONCLUSIVE"),
    ),
    evidenceDigests: [
      ...new Set([
        ...certificate.records.map((record) => record.digest),
        ...certificate.checks.flatMap((check) => check.evidence),
      ]),
    ].sort(),
  };
}

function isSha256(value: string): boolean {
  return /^sha256:[0-9a-fA-F]{64}$/.test(value);
}

export interface AssuranceImportResult {
  status: "ACCEPTED" | "REJECTED";
  reason: string;
  model: AssuranceWorkbenchModel | null;
}

/**
 * Fail-closed import boundary. The viewer does not recompute producer claims,
 * but it refuses malformed digest bindings, records marked invalid, or a PASS
 * certificate that contradicts any critical non-PASS check.
 */
export function importAssuranceCertificate(
  certificate: AssuranceCertificateView,
): AssuranceImportResult {
  if (!isSha256(certificate.integrity.certificateDigest)) {
    return { status: "REJECTED", reason: "malformed certificate digest", model: null };
  }
  const badRecord = certificate.records.find(
    (record) => !record.integrityValid || !isSha256(record.digest),
  );
  if (badRecord) {
    return {
      status: "REJECTED",
      reason: `record integrity rejected: ${badRecord.id}`,
      model: null,
    };
  }
  const malformedEvidence = certificate.checks
    .flatMap((check) => check.evidence)
    .find((digest) => !isSha256(digest));
  if (malformedEvidence) {
    return { status: "REJECTED", reason: "malformed evidence digest", model: null };
  }
  if (certificate.status === "PASS") {
    const contradictory = certificate.checks.find(
      (check) => check.critical && check.state !== "PASS",
    );
    if (contradictory) {
      return {
        status: "REJECTED",
        reason: `PASS certificate contradicts critical ${contradictory.state} check: ${contradictory.id}`,
        model: null,
      };
    }
  }
  return {
    status: "ACCEPTED",
    reason: "integrity envelope accepted without verdict promotion",
    model: projectAssuranceCertificate(certificate),
  };
}
