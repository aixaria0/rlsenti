import assert from "node:assert/strict";
import test from "node:test";
import { AETHERFORGE_REPAIR_CAPTURE } from "./repair-artifact.ts";

test("captured repair artifact preserves claim/verifier identity across repair", () => {
  const { artifact } = AETHERFORGE_REPAIR_CAPTURE;
  assert.equal(artifact.schema, "repair-artifact/v1");
  assert.equal(artifact.originalOutcome, "WITNESS_FOUND");
  assert.equal(artifact.outcome, "REPAIR_FOUND");
  assert.equal(artifact.selectedActions.length, 1);
  assert.equal(artifact.selectedActions[0]!.label, "restore:bounce[0].rho");
  assert.equal(artifact.postRepairVerification?.outcome, "UNREACHABLE_IN_MODEL");
  assert.equal(
    artifact.postRepairVerification?.problemId,
    artifact.originalProblemId,
  );
  assert.equal(
    artifact.postRepairVerification?.adapterId,
    artifact.verificationAdapterId,
  );
  assert.equal(artifact.metrics.rejectedIdentityCandidates, 0);
  assert.deepEqual(
    artifact.postRepairVerification?.scope,
    artifact.scope,
  );
  assert.deepEqual(
    artifact.postRepairVerification?.assumptions,
    artifact.assumptions,
  );
});
