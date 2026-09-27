export type AssuranceVerdict = "PASS" | "FAIL" | "BLOCKED" | "NOT_TESTED";
export type AssurancePlane = "POSSIBILITY" | "REALITY" | "CONFORMANCE" | "RECOVERY";

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
  const planes: AssuranceWorkbenchModel["planes"] = { POSSIBILITY: [], REALITY: [], CONFORMANCE: [], RECOVERY: [] };
  for (const check of certificate.checks) planes[check.plane].push(check);
  return {
    certificate,
    planes,
    criticalFailures: certificate.checks.filter((check) => check.critical && check.state === "FAIL"),
    criticalBlocked: certificate.checks.filter((check) => check.critical && (check.state === "BLOCKED" || check.state === "NOT_TESTED")),
    evidenceDigests: [...new Set([...certificate.records.map((record) => record.digest), ...certificate.checks.flatMap((check) => check.evidence)])].sort(),
  };
}
