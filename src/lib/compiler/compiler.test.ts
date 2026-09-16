import assert from "node:assert/strict";
import test from "node:test";
import { compile } from "./compile.ts";
import { sha256 } from "./hash.ts";
import {
  abort,
  cloneWorld,
  conservationReport,
  commit,
  poolsConserved,
  prepare,
  prepareReceive,
  seedWorld,
} from "./exchange.ts";
import { helloProc, paymentProc, reduce } from "./rho.ts";

test("SHA-256 handles UTF-8 correctly", () => {
  assert.equal(sha256("hello"), "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  assert.equal(sha256("é"), "4a99557e4037c3539de2eb65472017cad5f9557f7a0625a09f1c3f6e2ba69c4c");
});

test("exchange commit preserves per-pool token inventory", () => {
  const genesis = seedWorld();
  const world = cloneWorld(genesis);

  assert.equal(prepare(world, "ALICE-BOB", "bob", "t42", "A", 100, 999999), true);
  assert.equal(prepareReceive(world, "BOB-GBP", "bob", "t42", "A", 50, 999999, "toAlice"), true);
  assert.equal(commit(world, "ALICE-BOB", "bob", "t42"), true);
  assert.equal(commit(world, "BOB-GBP", "bob", "t42"), true);

  assert.equal(poolsConserved(world, genesis), true);
  assert.equal(conservationReport(world, genesis).conserved, true);
});

test("exchange abort restores the prepared pool exactly", () => {
  const genesis = seedWorld();
  const world = cloneWorld(genesis);

  assert.equal(prepare(world, "ALICE-BOB", "bob", "t42", "A", 100, 999999), true);
  assert.equal(abort(world, "ALICE-BOB", "bob", "t42", 18490), true);

  assert.equal(poolsConserved(world, genesis), true);
  assert.deepEqual(world.pools, genesis.pools);
});

test("prepareReceive failure is atomic and does not leave a credited balance", () => {
  const genesis = seedWorld();
  const world = cloneWorld(genesis);
  const before = structuredClone(world.pools["BOB-GBP"]);

  assert.equal(prepareReceive(world, "BOB-GBP", "bob", "t42", "A", 50, 999999, "missing-link"), false);
  assert.deepEqual(world.pools["BOB-GBP"], before);
  assert.equal(conservationReport(world, genesis).conserved, true);
});

test("commit cannot follow an aborted transaction", () => {
  const world = seedWorld();
  assert.equal(prepare(world, "ALICE-BOB", "bob", "t42", "A", 100, 999999), true);
  assert.equal(abort(world, "ALICE-BOB", "bob", "t42", 18490), true);
  assert.equal(commit(world, "ALICE-BOB", "bob", "t42"), false);
});

test("rho hello process reaches a normal form with one COMM", () => {
  const { source, proc } = helloProc();
  const execution = reduce(source, proc);
  assert.equal(execution.comms, 1);
  assert.equal(execution.stuck, false);
  assert.equal(execution.leftoverProduces.length, 0);
  assert.equal(execution.leftoverConsumes.length, 0);
});

test("cap-payment reduces the exact source shown to the user", () => {
  const { source, proc } = paymentProc();
  const execution = reduce(source, proc);
  assert.equal(execution.source, source);
  assert.equal(execution.stuck, false);
  assert.ok(execution.comms >= 1);
});

test("compiler baseline exposes a real conserved exchange result", () => {
  const reality = compile("exchange-commit", "none");
  assert.equal(reality.exchange?.conserved, true);
  assert.equal(reality.status, "PASS");
  assert.equal(reality.envelopes.at(-1)?.verificationResults[0], reality.status);
  assert.ok(reality.envelopes.length >= 7);
});

test("compiler detects trace tampering with a failure witness", () => {
  const reality = compile("hello-rho", "tamper-trace");
  assert.equal(reality.replay?.match, false);
  assert.equal(reality.witness?.invariantId, "I-RPL-01");
  assert.equal(reality.status, "FAIL");
  assert.equal(reality.envelopes.at(-1)?.verificationResults[0], "FAIL");
});

test("compiler detects a lying node without confusing it with lattice quorum", () => {
  const reality = compile("hello-rho", "node-c-lied");
  assert.equal(reality.cross?.hashAgreement, false);
  assert.equal(reality.status, "FAIL");
  assert.equal(reality.witness?.invariantId, "I-02");
  assert.equal(reality.envelopes.at(-1)?.verificationResults[0], "FAIL");
});

test("compiler detects duplicate validator identity separately from block proposer", () => {
  const reality = compile("hello-rho", "dup-validator");
  assert.equal(reality.invariants.find((i) => i.id === "I-05")?.status, "FAIL");
  assert.equal(reality.observations[0]?.proposer, reality.observations[2]?.proposer);
  assert.equal(reality.observations[1]?.validatorId, reality.observations[2]?.validatorId);
  assert.equal(reality.observations[2]?.duplicateValidator, true);
});
