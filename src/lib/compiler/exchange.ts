/** QuantumOS pooled token exchange — prepare → prepareReceive → commit/abort.
 *  Verbs and conservation follow rchain-community/quantum-os ExchangeDemo.md.
 */

export type Side = "A" | "B";
export type TxStatus = "prepared" | "committed" | "aborted";

export interface Balance {
  a: number;
  b: number;
}

export interface Pool {
  id: string;
  shard: string;
  tokenA: string;
  tokenB: string;
  rate: number;
  reserveA: number;
  reserveB: number;
  owner: string;
  links: Record<string, { exchangeUri: string; shard: string }>;
  balances: Record<string, Balance>;
}

export interface PreparedTx {
  txId: string;
  poolId: string;
  holder: string;
  fromSide: Side;
  amount: number;
  got: number;
  toSide: Side;
  expiryBlock: number;
  status: TxStatus;
  snapshot: { reserveA: number; reserveB: number; bal: Balance };
}

export interface ExchangeEvent {
  verb: string;
  actor: string;
  poolId: string;
  detail: string;
  ok: boolean;
  result: unknown;
}

export interface ConservationReport {
  conserved: boolean;
  perPool: Record<string, { a: boolean; b: boolean }>;
  reason: string;
}

export interface ExchangeWorld {
  pools: Record<string, Pool>;
  txs: Record<string, PreparedTx[]>;
  events: ExchangeEvent[];
  conserved: boolean;
}

const RATE_SCALE = 1_000_000;

function quote(pool: Pool, from: Side, amount: number): number {
  if (from === "A") return Math.floor((amount * pool.rate) / RATE_SCALE);
  return Math.floor((amount * RATE_SCALE) / pool.rate);
}

function bal(pool: Pool, who: string): Balance {
  return pool.balances[who] ?? { a: 0, b: 0 };
}

function setBal(pool: Pool, who: string, b: Balance) {
  pool.balances[who] = b;
}

function swap(pool: Pool, who: string, from: Side, amount: number): { got: number } | { err: string } {
  if (!Number.isInteger(amount) || amount <= 0) return { err: "amount must be a positive integer" };
  const out = quote(pool, from, amount);
  if (!Number.isInteger(out) || out <= 0) return { err: "quoted output is not positive" };
  const b = { ...bal(pool, who) };
  if (from === "A") {
    if (b.a < amount) return { err: "insufficient balance" };
    if (pool.reserveB < out) return { err: "insufficient reserve" };
    b.a -= amount;
    b.b += out;
    pool.reserveA += amount;
    pool.reserveB -= out;
  } else {
    if (b.b < amount) return { err: "insufficient balance" };
    if (pool.reserveA < out) return { err: "insufficient reserve" };
    b.b -= amount;
    b.a += out;
    pool.reserveB += amount;
    pool.reserveA -= out;
  }
  setBal(pool, who, b);
  return { got: out };
}

function unswap(pool: Pool, who: string, from: Side, amount: number, got: number) {
  const b = { ...bal(pool, who) };
  if (from === "A") {
    b.a += amount;
    b.b -= got;
    pool.reserveA -= amount;
    pool.reserveB += got;
  } else {
    b.b += amount;
    b.a -= got;
    pool.reserveB -= amount;
    pool.reserveA += got;
  }
  setBal(pool, who, b);
}

function push(w: ExchangeWorld, verb: string, actor: string, poolId: string, ok: boolean, detail: string, result: unknown) {
  w.events.push({ verb, actor, poolId, ok, detail, result });
}

export function seedWorld(): ExchangeWorld {
  const aliceBob: Pool = {
    id: "ALICE-BOB",
    shard: "shard-A",
    tokenA: "rho:id:coin4a",
    tokenB: "rho:id:bux9k7",
    rate: 500_000,
    reserveA: 0,
    reserveB: 500,
    owner: "alice",
    links: { toParis: { exchangeUri: "rho:id:paris", shard: "shard-B" } },
    balances: { bob: { a: 100, b: 0 } },
  };
  const bobGbp: Pool = {
    id: "BOB-GBP",
    shard: "shard-B",
    tokenA: "rho:id:bux9k7",
    tokenB: "rho:id:gbp1",
    rate: 840_000,
    reserveA: 0,
    reserveB: 200,
    owner: "paris",
    links: { toAlice: { exchangeUri: "rho:id:9xm7c", shard: "shard-A" } },
    balances: {},
  };
  return { pools: { "ALICE-BOB": aliceBob, "BOB-GBP": bobGbp }, txs: {}, events: [], conserved: true };
}

export function prepare(w: ExchangeWorld, poolId: string, actor: string, txId: string, from: Side, amount: number, expiry: number): boolean {
  const pool = w.pools[poolId]!;
  const snap = { reserveA: pool.reserveA, reserveB: pool.reserveB, bal: { ...bal(pool, actor) } };
  const r = swap(pool, actor, from, amount);
  if ("err" in r) {
    push(w, "prepare", actor, poolId, false, r.err, r.err);
    return false;
  }
  const to: Side = from === "A" ? "B" : "A";
  const rec: PreparedTx = { txId, poolId, holder: actor, fromSide: from, amount, got: r.got, toSide: to, expiryBlock: expiry, status: "prepared", snapshot: snap };
  (w.txs[txId] ??= []).push(rec);
  push(w, "prepare", actor, poolId, true, `prepared ${txId}`, { prepared: txId, got: r.got, toSide: to, expiry });
  return true;
}

export function prepareReceive(w: ExchangeWorld, poolId: string, actor: string, txId: string, side: Side, amount: number, expiry: number, link: string): boolean {
  const pool = w.pools[poolId]!;
  if (!pool.links[link]) {
    push(w, "prepareReceive", actor, poolId, false, `no such link ${link}`, "no such link");
    return false;
  }
  const b = { ...bal(pool, actor) };
  if (side === "A") b.a += amount;
  else b.b += amount;
  setBal(pool, actor, b);
  const snap = { reserveA: pool.reserveA, reserveB: pool.reserveB, bal: { ...b } };
  const r = swap(pool, actor, side, amount);
  if ("err" in r) {
    if (side === "A") b.a -= amount;
    else b.b -= amount;
    setBal(pool, actor, b);
    push(w, "prepareReceive", actor, poolId, false, r.err, r.err);
    return false;
  }
  const to: Side = side === "A" ? "B" : "A";
  (w.txs[txId] ??= []).push({ txId, poolId, holder: actor, fromSide: side, amount, got: r.got, toSide: to, expiryBlock: expiry, status: "prepared", snapshot: snap });
  push(w, "prepareReceive", actor, poolId, true, `prepared remote ${txId}`, { prepared: txId, got: r.got, toSide: to, expiry });
  return true;
}

export function commit(w: ExchangeWorld, poolId: string, actor: string, txId: string): boolean {
  const rec = (w.txs[txId] ?? []).find((t) => t.poolId === poolId);
  if (!rec) { push(w, "commit", actor, poolId, false, "unknown tx", "unknown tx"); return false; }
  if (rec.holder !== actor) { push(w, "commit", actor, poolId, false, "not holder", "not holder"); return false; }
  if (rec.status === "committed") { push(w, "commit", actor, poolId, true, "idempotent commit", { committed: txId }); return true; }
  if (rec.status === "aborted") { push(w, "commit", actor, poolId, false, "already aborted", "already aborted"); return false; }
  rec.status = "committed";
  push(w, "commit", actor, poolId, true, `committed ${txId}`, { committed: txId, got: rec.got, toSide: rec.toSide });
  return true;
}

export function abort(w: ExchangeWorld, poolId: string, actor: string, txId: string, height: number): boolean {
  const rec = (w.txs[txId] ?? []).find((t) => t.poolId === poolId);
  if (!rec) { push(w, "abort", actor, poolId, false, "unknown tx", "unknown tx"); return false; }
  if (rec.status === "aborted") { push(w, "abort", actor, poolId, true, "idempotent abort", { aborted: txId }); return true; }
  if (rec.status === "committed") { push(w, "abort", actor, poolId, false, "already committed", "already committed"); return false; }
  if (rec.holder !== actor && height <= rec.expiryBlock) { push(w, "abort", actor, poolId, false, "not holder; not yet expired", "not holder; not yet expired"); return false; }
  const pool = w.pools[poolId]!;
  unswap(pool, rec.holder, rec.fromSide, rec.amount, rec.got);
  rec.status = "aborted";
  push(w, "abort", actor, poolId, true, `aborted ${txId} — reserves restored`, { aborted: txId });
  return true;
}

function totals(pool: Pool) {
  return {
    a: pool.reserveA + Object.values(pool.balances).reduce((s, x) => s + x.a, 0),
    b: pool.reserveB + Object.values(pool.balances).reduce((s, x) => s + x.b, 0),
  };
}

/** Compare each pool's total token inventory against its genesis snapshot. */
export function conservationReport(w: ExchangeWorld, genesis: ExchangeWorld): ConservationReport {
  const perPool: ConservationReport["perPool"] = {};
  let conserved = true;
  const reasons: string[] = [];
  for (const id of Object.keys(genesis.pools)) {
    const before = totals(genesis.pools[id]!);
    const after = totals(w.pools[id]!);
    const a = before.a === after.a;
    const b = before.b === after.b;
    perPool[id] = { a, b };
    if (!a || !b) {
      conserved = false;
      reasons.push(`${id}: A ${before.a}→${after.a}, B ${before.b}→${after.b}`);
    }
  }
  return { conserved, perPool, reason: conserved ? "all pool token inventories conserved" : reasons.join("; ") };
}

export function poolsConserved(w: ExchangeWorld, genesis: ExchangeWorld): boolean {
  const report = conservationReport(w, genesis);
  const successfulMutations = w.events.filter((e) => ["prepare", "prepareReceive", "commit", "abort"].includes(e.verb) && e.ok);
  const noInvalidMutation = w.events.every((e) => e.ok || ["prepare", "prepareReceive", "commit", "abort"].includes(e.verb));
  return report.conserved && successfulMutations.length > 0 && noInvalidMutation;
}

export function cloneWorld(w: ExchangeWorld): ExchangeWorld {
  return structuredClone(w);
}
