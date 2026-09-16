import { digest, hexPrefixed } from "./hash";

export type Name =
  | { k: "uf"; id: string }
  | { k: "uri"; uri: string }
  | { k: "var"; id: string };

export type Ground = string | number | boolean;

export type Proc =
  | { k: "0" }
  | { k: "|"; ps: Proc[] }
  | { k: "new"; ns: string[]; p: Proc }
  | { k: "send"; ch: Name; data: Ground[] }
  | { k: "for"; ch: Name; binds: string[]; p: Proc };

export interface Produce {
  id: string;
  ch: string;
  data: Ground[];
}
export interface Consume {
  id: string;
  ch: string;
  binds: string[];
  body: Proc;
}

export interface ReductionStep {
  n: number;
  rule: "NEW" | "COMM" | "PAR" | "DONE" | "STUCK";
  description: string;
  channel?: string;
  data?: Ground[];
  continuation?: string;
  produces: number;
  consumes: number;
}

export interface Execution {
  source: string;
  normalized: string;
  steps: ReductionStep[];
  leftoverProduces: Produce[];
  leftoverConsumes: Consume[];
  comms: number;
  stuck: boolean;
  stateHash: string;
  traceHash: string;
}

function chKey(n: Name, env: Map<string, string>): string {
  if (n.k === "uf") return `@${n.id}`;
  if (n.k === "uri") return n.uri;
  return env.get(n.id) ?? `?${n.id}`;
}

function flatten(p: Proc): Proc[] {
  if (p.k === "0") return [];
  if (p.k === "|") return p.ps.flatMap(flatten);
  return [p];
}

function pretty(p: Proc): string {
  switch (p.k) {
    case "0": return "Nil";
    case "|": return p.ps.map(pretty).join(" | ");
    case "new": return `new ${p.ns.join(", ")} in { ${pretty(p.p)} }`;
    case "send": return `${showName(p.ch)}!(${p.data.map(showG).join(", ")})`;
    case "for": return `for (${p.binds.map((b) => `@${b}`).join(", ")} <- ${showName(p.ch)}) { ${pretty(p.p)} }`;
  }
}

function showName(n: Name): string {
  if (n.k === "uf") return `@${n.id}`;
  if (n.k === "uri") return `\`${n.uri}\``;
  return n.id;
}

function showG(g: Ground): string {
  return typeof g === "string" ? JSON.stringify(g) : String(g);
}

let seq = 0;
function nid(prefix: string) {
  seq += 1;
  return `${prefix}${seq.toString(16).padStart(3, "0")}`;
}

/**
 * Deterministic reducer for the small ρ-calculus subset represented by Proc.
 * It models NEW name allocation, parallel flattening and COMM matching.
 * It is intentionally not presented as a full rchain-rust evaluator.
 */
export function reduce(source: string, proc: Proc): Execution {
  seq = 0;
  const steps: ReductionStep[] = [];
  const produces: Produce[] = [];
  const consumes: Consume[] = [];
  let env = new Map<string, string>();
  let active = flatten(proc);
  let comms = 0;

  const snapshot = () => ({ produces: produces.length, consumes: consumes.length });

  let guard = 0;
  while (active.length && guard++ < 64) {
    const p = active.shift()!;
    if (p.k === "new") {
      const next = new Map(env);
      for (const n of p.ns) next.set(n, `@${nid("uf")}`);
      env = next;
      steps.push({ n: steps.length, rule: "NEW", description: `bind unforgeable ${p.ns.join(", ")}`, ...snapshot() });
      active.push(...flatten(subst(p.p, env)));
      continue;
    }
    if (p.k === "send") {
      produces.push({ id: nid("p"), ch: chKey(p.ch, env), data: p.data });
      continue;
    }
    if (p.k === "for") {
      consumes.push({ id: nid("c"), ch: chKey(p.ch, env), binds: p.binds, body: p.p });
      continue;
    }
    if (p.k === "|") {
      active.push(...flatten(p));
      steps.push({ n: steps.length, rule: "PAR", description: "flatten parallel composition", ...snapshot() });
    }
  }

  let progressed = true;
  while (progressed) {
    progressed = false;
    for (let ci = 0; ci < consumes.length; ci++) {
      const c = consumes[ci]!;
      const pi = produces.findIndex((pr) => pr.ch === c.ch);
      if (pi < 0) continue;
      const pr = produces[pi]!;
      produces.splice(pi, 1);
      consumes.splice(ci, 1);
      comms += 1;
      const bound = substGround(c.body, c.binds, pr.data);
      steps.push({
        n: steps.length,
        rule: "COMM",
        description: `COMM on ${c.ch} — produce matched consume`,
        channel: c.ch,
        data: pr.data,
        continuation: pretty(bound),
        ...snapshot(),
      });
      active = flatten(bound);
      while (active.length) {
        const q = active.shift()!;
        if (q.k === "send") produces.push({ id: nid("p"), ch: chKey(q.ch, env), data: q.data });
        else if (q.k === "for") consumes.push({ id: nid("c"), ch: chKey(q.ch, env), binds: q.binds, body: q.p });
        else if (q.k === "|") active.push(...flatten(q));
        else if (q.k === "new") {
          const next = new Map(env);
          for (const n of q.ns) next.set(n, `@${nid("uf")}`);
          env = next;
          active.push(...flatten(subst(q.p, env)));
        }
      }
      progressed = true;
      break;
    }
  }

  const stuck = produces.length > 0 && consumes.length > 0;
  steps.push({
    n: steps.length,
    rule: stuck ? "STUCK" : "DONE",
    description: stuck ? "no further COMM; leftover produce/consume" : `normal form — ${comms} COMM reduction(s)`,
    produces: produces.length,
    consumes: consumes.length,
  });

  const stateHash = hexPrefixed(
    digest([
      "state-v2",
      produces.map((p) => [p.ch, p.data]),
      consumes.map((c) => [c.ch, c.binds, pretty(c.body)]),
    ]),
  );
  const traceHash = hexPrefixed(
    digest([
      "trace-v2",
      ...steps.map((s) => ({
        n: s.n,
        rule: s.rule,
        description: s.description,
        channel: s.channel ?? null,
        data: s.data ?? null,
        continuation: s.continuation ?? null,
        produces: s.produces,
        consumes: s.consumes,
      })),
    ]),
  );

  return { source, normalized: pretty(proc), steps, leftoverProduces: produces, leftoverConsumes: consumes, comms, stuck, stateHash, traceHash };
}

function subst(p: Proc, env: Map<string, string>): Proc {
  const name = (n: Name): Name => {
    if (n.k === "var" && env.has(n.id)) {
      const v = env.get(n.id)!;
      return v.startsWith("@") ? { k: "uf", id: v.slice(1) } : n;
    }
    return n;
  };
  switch (p.k) {
    case "0": return p;
    case "|": return { k: "|", ps: p.ps.map((q) => subst(q, env)) };
    case "new": return { k: "new", ns: p.ns, p: subst(p.p, env) };
    case "send": return { k: "send", ch: name(p.ch), data: p.data };
    case "for": return { k: "for", ch: name(p.ch), binds: p.binds, p: subst(p.p, env) };
  }
}

function substGround(p: Proc, binds: string[], data: Ground[]): Proc {
  // The current Proc model stores binds but does not represent ground-value variables.
  // Preserve the continuation exactly rather than pretending substitution is implemented.
  void binds;
  void data;
  return p;
}

export function helloProc(): { source: string; proc: Proc } {
  const source = `new ch in {
  ch!("hello")
  | for (@msg <- ch) { Nil }
}`;
  const proc: Proc = {
    k: "new", ns: ["ch"],
    p: { k: "|", ps: [
      { k: "send", ch: { k: "var", id: "ch" }, data: ["hello"] },
      { k: "for", ch: { k: "var", id: "ch" }, binds: ["msg"], p: { k: "0" } },
    ] },
  };
  return { source, proc };
}

export function exchangeProc(verbs: string[]): { source: string; proc: Proc } {
  const lines = verbs.map((v, i) => `  pool!("${v}") | for (@ack${i} <- pool) { Nil }`);
  const source = `new pool in {
${lines.join(" |\n")}
}`;
  const sends: Proc[] = verbs.map((v) => ({ k: "send" as const, ch: { k: "var" as const, id: "pool" }, data: [v] }));
  const recvs: Proc[] = verbs.map(() => ({ k: "for" as const, ch: { k: "var" as const, id: "pool" }, binds: ["ack"], p: { k: "0" as const } }));
  return { source, proc: { k: "new", ns: ["pool"], p: { k: "|", ps: [...sends, ...recvs] } } };
}

export function paymentProc(): { source: string; proc: Proc } {
  const source = `new purse, ack in {
  purse!("authorize", "payment-authorized")
  | for (@ok <- purse) {
    purse!("transfer", 20, "alice") | for (@rcpt <- ack) { Nil }
  }
}`;
  const purse: Name = { k: "var", id: "purse" };
  const ack: Name = { k: "var", id: "ack" };
  const proc: Proc = {
    k: "new", ns: ["purse", "ack"],
    p: { k: "|", ps: [
      { k: "send", ch: purse, data: ["authorize", "payment-authorized"] },
      { k: "for", ch: purse, binds: ["ok"], p: {
        k: "|", ps: [
          { k: "send", ch: purse, data: ["transfer", 20, "alice"] },
          { k: "for", ch: ack, binds: ["rcpt"], p: { k: "0" } },
        ],
      } },
    ] },
  };
  return { source, proc };
}
