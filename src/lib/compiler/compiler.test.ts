import assert from "node:assert/strict";
import test from "node:test";
import { compile } from "./compile.ts";
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
import { helloProc, reduce } from "./rho.ts";

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

test("compiler baseline exposes a real conserved exchange result", () => {
  const reality = compile("exchange-commit", "none");
  assert.equal(reality.exchange?.conserved, true);
  assert.equal(reality.status, "PASS");
  assert.ok(reality.envelopes.length >= 7);
});

test("compiler detects trace tampering with a failure witness", () => {
  const reality = compile("hello-rho", "tamper-trace");
  assert.equal(reality.replay?.match, false);
  assert.equal(reality.witness?.invariantId, "I-RPL-01");
  assert.equal(reality.status, "FAIL");
});

test("compiler detects a lying node without confusing it with lattice quorum", () => {
  const reality = compile("hello-rho", "node-c-lied");
  assert.equal(reality.cross?.hashAgreement, false);
  assert.equal(reality.status, "FAIL");
  assert.equal(reality.witness?.invariantId, "I-02");
});
