import assert from "node:assert/strict";
import test from "node:test";
import { importAssuranceCertificate, projectAssuranceCertificate, type AssuranceCertificateView } from "./assurance-adapter.ts";

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

test("rejects malformed or explicitly invalid integrity instead of rendering it", () => {
  const base: AssuranceCertificateView = {
    schema: "causal-assurance-certificate/v1",
    id: "assurance:tamper",
    issuedAt: "2026-09-27T00:00:00Z",
    status: "PASS",
    records: [{
      id: "record-1", label: "fixture", source: "test", sourceClass: "NATIVE_REPLAY",
      state: "VERIFIED", digest: "sha256:" + "a".repeat(64), integrityValid: true,
    }],
    checks: [{
      id: "reality", plane: "REALITY", state: "PASS", critical: true,
      description: "fixture", evidence: ["sha256:" + "b".repeat(64)],
    }],
    integrity: { algorithm: "SHA-256", certificateDigest: "sha256:" + "c".repeat(64) },
  };
  assert.equal(importAssuranceCertificate(base).status, "ACCEPTED");
  const tampered = structuredClone(base);
  tampered.records[0]!.integrityValid = false;
  assert.equal(importAssuranceCertificate(tampered).status, "REJECTED");
  const malformed = structuredClone(base);
  malformed.integrity.certificateDigest = "sha256:bad";
  assert.equal(importAssuranceCertificate(malformed).status, "REJECTED");
});

test("imports the frozen cross-repo fixture digest without promoting its verdict", () => {
  const fixtureDigest = "sha256:4f4fd3c2715b193a78d79ac0be11c893aa7bfdc6f9a52ca7de1240d64f2a1703";
  const certificate: AssuranceCertificateView = {
    schema: "causal-assurance-certificate/v1",
    id: "assurance:cross-repo-fixture",
    issuedAt: "2026-09-27T00:00:00Z",
    status: "BLOCKED",
    records: [{
      id: "fixture-record", label: "canonical fixture", source: "RCHAIN-COMPLIER",
      sourceClass: "DETERMINISTIC_REPLAY", state: "VERIFIED", digest: fixtureDigest, integrityValid: true,
    }],
    checks: [{
      id: "fixture-check", plane: "POSSIBILITY", state: "PASS", critical: true,
      description: "frozen cross-repo fixture", evidence: [fixtureDigest],
    }],
    integrity: { algorithm: "SHA-256", certificateDigest: "sha256:" + "c".repeat(64) },
  };
  const imported = importAssuranceCertificate(certificate);
  assert.equal(imported.status, "ACCEPTED");
  assert.equal(imported.model?.certificate.status, "BLOCKED");
  assert.deepEqual(imported.model?.evidenceDigests, [fixtureDigest]);
});
