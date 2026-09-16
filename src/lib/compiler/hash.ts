/** Deterministic SHA-256 primitives for browser + SSR execution. */

function rotr(n: number, x: number) {
  return (x >>> n) | (x << (32 - n));
}

const K = new Uint32Array(64);

(function init() {
  let n = 0;
  const composite = new Uint8Array(312);
  for (let c = 2; n < 64; c++) {
    if (composite[c]) continue;
    for (let i = c * c; i < 312; i += c) composite[i] = 1;
    K[n++] = Math.floor(Math.pow(c, 1 / 3) * 2 ** 32);
  }
})();

const H0 = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
  0x1f83d9ab, 0x5be0cd19,
];

export function sha256(message: string): string {
  const bytes = Array.from(new TextEncoder().encode(message));
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push(Math.floor(bitLen / 2 ** (i * 8)) & 0xff);

  const h = H0.slice();
  const w = new Uint32Array(64);
  for (let off = 0; off < bytes.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      w[i] =
        ((bytes[j]! << 24) | (bytes[j + 1]! << 16) | (bytes[j + 2]! << 8) | bytes[j + 3]!) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(7, w[i - 15]!) ^ rotr(18, w[i - 15]!) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(17, w[i - 2]!) ^ rotr(19, w[i - 2]!) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let a = h[0]!,
      b = h[1]!,
      c = h[2]!,
      d = h[3]!,
      e = h[4]!,
      f = h[5]!,
      g = h[6]!,
      hh = h[7]!;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0]! + a) >>> 0;
    h[1] = (h[1]! + b) >>> 0;
    h[2] = (h[2]! + c) >>> 0;
    h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0;
    h[5] = (h[5]! + f) >>> 0;
    h[6] = (h[6]! + g) >>> 0;
    h[7] = (h[7]! + hh) >>> 0;
  }
  return h.map((x) => x.toString(16).padStart(8, "0")).join("");
}

/**
 * Hash a typed sequence rather than joining raw values with a delimiter.
 * This prevents delimiter-collision cases such as ["a|b", "c"] and
 * ["a", "b", "c"] producing the same preimage.
 */
export function digest(parts: unknown[]): string {
  const encoded = parts.map((part) => {
    if (part === null) return ["null", null];
    if (typeof part === "string") return ["string", part];
    if (typeof part === "number") return ["number", part];
    if (typeof part === "boolean") return ["boolean", part];
    if (part === undefined) return ["undefined", null];
    return ["json", part];
  });
  return sha256(JSON.stringify(encoded));
}

export function hexPrefixed(hex: string): string {
  return hex.startsWith("0x") ? hex : `0x${hex}`;
}

export function shortHex(hex: string, head = 4, tail = 4): string {
  const h = hex.replace(/^0x/, "");
  if (h.length <= head + tail) return `0x${h}`;
  return `0x${h.slice(0, head)}…${h.slice(-tail)}`;
}
