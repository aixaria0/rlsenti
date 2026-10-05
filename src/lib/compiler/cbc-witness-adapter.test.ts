import assert from "node:assert/strict";
import test from "node:test";
import { sha256 } from "./hash.ts";
import {
  CBC_WITNESS_SCHEMA,
  receiveCbcWitness,
  verifyCbcWorkbenchReceipt,
} from "./cbc-witness-adapter.ts";

function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))) return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return "{" + Object.keys(record).sort().map((key) =>
      JSON.stringify(key) + ":" + canonical(record[key])).join(",") + "}";
  }
  throw new Error("unsupported fixture");
}

function envelope() {
  const body = {
    schema: CBC_WITNESS_SCHEMA,
    source: {
      repository: "aixaria0/RCHAIN-COMPLIER",
      commit: "2d2c3d879b1a078693c8551385efb54a811d7172",
      upstreamRevision: "rchain-community/rchain-rust@d92f0787a6096cd6d79864ec2d7c1dd9b6912d0b",
    },
    report: {
      milestone: "M27",
      upstreamRevision: "rchain-community/rchain-rust@d92f0787a6096cd6d79864ec2d7c1dd9b6912d0b",
      digest: "a".repeat(64),
      deterministic: true,
      minimalFinalizingDistance: 1,
      minimalFinalizingWitnesses: [{
        justifications: ["a3", "a3", "c3", "d3"],
        minimumMessageSenders: ["v0", "v0", "v2", "v3"],
        distanceFromControl: 1,
        distinctMinimumSenders: 3,
        classification: "UNDER_CARDINALITY",
        reachable: true, finalized: true, currentCountGate: true, senderCoverage: false,
      }],
    },
  };
  return { ...body, payloadSha256: sha256(canonical(body)) };
}

test("imports actual external payload into a deterministic provenance receipt", () => {
  const first = receiveCbcWitness(envelope());
  const second = receiveCbcWitness(envelope());
  assert.deepEqual(first, second);
  assert.equal(first.witness.classification, "UNDER_CARDINALITY");
  assert.equal(first.transport.integrity, "MATCH");
  assert.equal(first.transport.authenticatedProducer, false);
  assert.equal(first.witness.sourceReportedFinalized, true);
  assert.ok(first.claimBoundary.includes("not live-network"));
  assert.equal(verifyCbcWorkbenchReceipt(first), true);
});

test("tampered payload is rejected before importing", () => {
  const payload = envelope();
  payload.report.minimalFinalizingWitnesses[0]!.justifications[0] = "b3";
  assert.throws(() => receiveCbcWitness(payload), /digest mismatch/);
});

test("self-hashed forged source pin still rejected", () => {
  const payload = envelope();
  payload.source.commit = "f".repeat(40);
  payload.payloadSha256 = sha256(canonical({
    schema: payload.schema, source: payload.source, report: payload.report,
  }));
  assert.throws(() => receiveCbcWitness(payload), /Unsupported CBC source pin/);
});

test("self-hashed malformed witness still rejected", () => {
  const payload = envelope();
  payload.report.minimalFinalizingWitnesses[0]!.minimumMessageSenders = ["v0", "v1", "v2", "v3"];
  payload.payloadSha256 = sha256(canonical({
    schema: payload.schema, source: payload.source, report: payload.report,
  }));
  assert.throws(() => receiveCbcWitness(payload), /Unsupported minimum-witness structure/);
});

test("receipt digest fails if an imported status is edited", () => {
  const receipt = receiveCbcWitness(envelope());
  assert.equal(verifyCbcWorkbenchReceipt({ ...receipt, witness: {
    ...receipt.witness, sourceReportedFinalized: false,
  } }), false);
});

test("rejects unknown schema and unsupported JSON", () => {
  assert.throws(() => receiveCbcWitness({ ...envelope(), schema: "other" }), /Unknown CBC witness schema/);
  assert.throws(() => receiveCbcWitness({ ...envelope(), report: null }), /Missing source\/report/);
});
