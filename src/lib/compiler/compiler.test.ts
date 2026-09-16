import assert from "node:assert/strict";
import test from "node:test";
import {
  abort,
  cloneWorld,
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
});

test("exchange abort restores the prepared pool exactly", () => {
  const genesis = seedWorld();
  const world = cloneWorld(genesis);

  assert.equal(prepare(world, "ALICE-BOB", "bob", "t42", "A", 100, 999999), true);
  assert.equal(abort(world, "ALICE-BOB", "bob", "t42", 18490), true);

  assert.equal(poolsConserved(world, genesis), true);
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
