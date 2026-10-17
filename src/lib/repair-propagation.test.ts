import assert from "node:assert/strict";
import test from "node:test";
import { inspectRepairPropagation, type RepairPropagationEnvelope } from "./repair-propagation";

const fixture: RepairPropagationEnvelope = {
  schema: "causal-assurance-repair-propagation/v1",
  repairProblemId: "casper-duplicate-minimum-sender-coverage-repair",
  repairArtifactDigest: `sha256:${"a".repeat(64)}`,
  nativeReceiptDigest: `sha256:${"b".repeat(64)}`,
  nativeBindingDigest: `sha256:${"c".repeat(64)}`,
  upstreamRepository: "rchain-community/rchain-rust",
  upstreamCommit: "d92f0787a6096cd6d79864ec2d7c1dd9b6912d0b",
  repairAction: "replace:a2->d3",
  nativeReplayVerified: true,
  claimBoundary: "bounded pinned replay",
};

test("accepts a well-formed portable repair propagation envelope", () => {
  const result = inspectRepairPropagation(fixture);
  assert.equal(result.accepted, true);
  assert.match(result.claimBoundary, /does not promote/);
});

test("fails closed when native replay is absent", () => {
  const result = inspectRepairPropagation({ ...fixture, nativeReplayVerified: false });
  assert.equal(result.accepted, false);
});

test("fails closed on malformed transitive digest", () => {
  const result = inspectRepairPropagation({ ...fixture, nativeBindingDigest: "sha256:bad" });
  assert.equal(result.accepted, false);
});
