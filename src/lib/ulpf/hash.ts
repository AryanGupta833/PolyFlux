// Dependency-free synchronous SHA-256 + ID helpers (runs in browser and edge workers)

let K: number[] | null = null;
let H0: number[] | null = null;

function primes(n: number): number[] {
  const out: number[] = [];
  for (let c = 2; out.length < n; c++) {
    if (out.every((p) => c % p !== 0)) out.push(c);
  }
  return out;
}

function init() {
  if (K && H0) return;
  const p = primes(64);
  const frac = (x: number) => ((x - Math.floor(x)) * 0x100000000) >>> 0;
  K = p.map((q) => frac(Math.cbrt(q)));
  H0 = p.slice(0, 8).map((q) => frac(Math.sqrt(q)));
}

export function sha256Bytes(bytes: Uint8Array): string {
  init();
  const k = K as number[];
  const h = (H0 as number[]).slice();
  const l = bytes.length;
  const withPad = new Uint8Array(((l + 9 + 63) >> 6) << 6);
  withPad.set(bytes);
  withPad[l] = 0x80;
  const bitLen = l * 8;
  const dv = new DataView(withPad.buffer);
  dv.setUint32(withPad.length - 4, bitLen >>> 0);
  dv.setUint32(withPad.length - 8, Math.floor(bitLen / 0x100000000));
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < withPad.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15] as number;
      const b = w[i - 2] as number;
      const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3);
      const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
      w[i] = ((w[i - 16] as number) + s0 + (w[i - 7] as number) + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h as [number, number, number, number, number, number, number, number];
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + (k[i] as number) + (w[i] as number)) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
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
    const add = [a, b, c, d, e, f, g, hh];
    for (let i = 0; i < 8; i++) h[i] = ((h[i] as number) + (add[i] as number)) >>> 0;
  }
  return h.map((x) => x.toString(16).padStart(8, "0")).join("");
}

export function sha256(text: string): string {
  return sha256Bytes(new TextEncoder().encode(text));
}

function toUuid(hex: string, version: number): string {
  const v = hex.slice(0, 32).split("");
  v[12] = version.toString(16);
  v[16] = ((parseInt(v[16] as string, 16) & 0x3) | 0x8).toString(16);
  const s = v.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

/** Time-ordered UUIDv7 */
export function uuidv7(): string {
  const ts = Date.now().toString(16).padStart(12, "0");
  const rnd = new Uint8Array(10);
  crypto.getRandomValues(rnd);
  const r = Array.from(rnd, (b) => b.toString(16).padStart(2, "0")).join("");
  return toUuid(ts + r, 7);
}

/** Deterministic name-based ID (UUIDv5-style, SHA-256 digest) */
export function uuidFromName(ns: string, name: string): string {
  return toUuid(sha256(`${ns}:${name}`), 5);
}
