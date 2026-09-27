import assert from "node:assert/strict";
import test from "node:test";
import { projectAssuranceCertificate, type AssuranceCertificateView } from "./assurance-adapter.ts";

test("projects assurance planes without promoting a blocked certificate", () => {
  const certificate: AssuranceCertificateView = {
    schema: "causal-assurance-certificate/v1", id: "assurance:test",
    issuedAt: "2026-09-27T00:00:00Z", status: "BLOCKED", records: [],
    checks: [
      { id: "possibility", plane: "POSSIBILITY", state: "PASS", critical: true, description: "bounded search completed", evidence: ["sha256:a"] },
      { id: "recovery", plane: "RECOVERY", state: "BLOCKED", critical: true, description: "independent recovery not executed", evidence: [] },
    ],
    integrity: { algorithm: "SHA-256", certificateDigest: "sha256:certificate" },
  };
  const model = projectAssuranceCertificate(certificate);
  assert.equal(model.certificate.status, "BLOCKED");
  assert.equal(model.planes.POSSIBILITY.length, 1);
  assert.equal(model.criticalBlocked.length, 1);
  assert.deepEqual(model.evidenceDigests, ["sha256:a"]);
});
