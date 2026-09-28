// Format detection + parser registry. Parsers EXTRACT named fields only; they never normalize.
import type { Format, FormatCandidate, ParsedEvent, ParsedValue, RawEvent } from "./types";

const MAX_PARSE_LEN = 64 * 1024;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ---------- helpers ----------
function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Linear key=value tokenizer (no backtracking regex): supports quoted values. */
export function parseKv(text: string, offset = 0): Record<string, ParsedValue> {
  const out: Record<string, ParsedValue> = {};
  let i = 0;
  const n = text.length;
  while (i < n) {
    while (i < n && /[\s,;]/.test(text[i] as string)) i++;
    const ks = i;
    while (i < n && /[A-Za-z0-9_.\-@]/.test(text[i] as string)) i++;
    const key = text.slice(ks, i);
    if (!key || text[i] !== "=") {
      // skip non-kv token
      while (i < n && !/\s/.test(text[i] as string)) i++;
      continue;
    }
    i++; // '='
    let vs = i;
    let value: string;
    if (text[i] === '"') {
      vs = ++i;
      while (i < n && text[i] !== '"') i++;
      value = text.slice(vs, i);
      i++;
    } else {
      while (i < n && !/\s/.test(text[i] as string)) i++;
      value = text.slice(vs, i);
    }
    out[key] = { value, span: [offset + vs, offset + vs + value.length] };
  }
  return out;
}

function kvRatio(text: string) {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (!tokens.length) return 0;
  return tokens.filter((t) => /^[A-Za-z0-9_.\-@]+=/.test(t)).length / tokens.length;
}

function flattenJson(obj: unknown, prefix = "", out: Record<string, ParsedValue> = {}, raw = "") {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      flattenJson(v, prefix ? `${prefix}.${k}` : k, out, raw);
    }
  } else {
    const value = Array.isArray(obj) ? JSON.stringify(obj) : String(obj);
    const key = prefix.split(".").pop() ?? prefix;
    const idx = raw.indexOf(`"${key}"`);
    const vIdx = idx >= 0 ? raw.indexOf(value, idx) : -1;
    const pv: ParsedValue = { value };
    if (vIdx >= 0) pv.span = [vIdx, vIdx + value.length];
    out[prefix] = pv;
  }
  return out;
}

function infer3164Time(mon: string, day: string, time: string, ingest: string): string {
  const now = new Date(ingest);
  const m = MONTHS.indexOf(mon);
  let year = now.getUTCFullYear();
  // Year rollover: a December log received in January belongs to last year
  if (m > now.getUTCMonth() + 1) year -= 1;
  const d = new Date(`${year}-${String(m + 1).padStart(2, "0")}-${day.padStart(2, "0")}T${time}Z`);
  return isNaN(d.getTime()) ? ingest : d.toISOString();
}

function isoOrNull(s: string): string | null {
  const d = new Date(s.includes("T") || s.endsWith("Z") ? s : s.replace(" ", "T") + "Z");
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// ---------- format detection (signature/structure based, never filename based) ----------
export function detectFormats(raw: RawEvent): FormatCandidate[] {
  const t = raw.raw_text.trim();
  const c: FormatCandidate[] = [];
  if (raw.ingestion_context.csv_header) c.push({ format: "csv", confidence: 0.95, reason: "row of CSV ingestion with header" });
  if (t.startsWith("{") && t.endsWith("}")) {
    try {
      JSON.parse(t);
      c.push({ format: "json", confidence: 0.99, reason: "balanced object parse succeeded" });
    } catch {
      c.push({ format: "json", confidence: 0.2, reason: "looks like JSON but parse failed" });
    }
  }
  if (/(^|\s)CEF:\d\|/.test(t) && t.slice(t.indexOf("CEF:")).split("|").length >= 8)
    c.push({ format: "cef", confidence: 0.98, reason: "CEF:0| prefix with 7 header fields" });
  if (/(^|\s)LEEF:(1\.0|2\.0)\|/.test(t)) c.push({ format: "leef", confidence: 0.97, reason: "LEEF:1.0|/2.0| prefix" });
  if (/^<\d{1,3}>/.test(t)) c.push({ format: "syslog", confidence: 0.9, reason: "leading <PRI> header" });
  const r = kvRatio(t);
  if (r >= 0.3) c.push({ format: "kv", confidence: Math.min(0.95, 0.4 + r * 0.6), reason: `${Math.round(r * 100)}% key=value tokens` });
  c.push({ format: "text", confidence: 0.05, reason: "fallback" });
  return c.sort((a, b) => b.confidence - a.confidence);
}

// ---------- parsers ----------
interface ParserDef {
  name: string;
  version: string;
  supports(raw: RawEvent, cands: FormatCandidate[]): number;
  parse(raw: RawEvent): Omit<ParsedEvent, "selection_reason" | "alternatives">;
}

const has = (c: FormatCandidate[], f: Format) => c.find((x) => x.format === f)?.confidence ?? 0;

function syslogHeader(t: string, ingest: string) {
  // RFC 5424: <PRI>1 TIMESTAMP HOST APP PROCID MSGID ...
  let m = /^<(\d{1,3})>1 (\S+) (\S+) (\S+) (\S+) (\S+) (?:-|\[[^\]]*\]) ?/.exec(t);
  if (m) {
    return { pri: +(m[1] as string), time: isoOrNull(m[2] as string) ?? ingest, inferred: false, host: m[3] as string, app: m[4] as string, body: t.slice(m[0].length), bodyOffset: m[0].length };
  }
  // RFC 3164: <PRI>Mmm dd hh:mm:ss HOST TAG: msg
  m = /^<(\d{1,3})>([A-Z][a-z]{2}) {1,2}(\d{1,2}) (\d\d:\d\d:\d\d) (\S+) ?/.exec(t);
  if (m) {
    return { pri: +(m[1] as string), time: infer3164Time(m[2] as string, m[3] as string, m[4] as string, ingest), inferred: true, host: m[5] as string, app: "", body: t.slice(m[0].length), bodyOffset: m[0].length };
  }
  m = /^<(\d{1,3})>/.exec(t);
  return { pri: m ? +(m[1] as string) : 13, time: ingest, inferred: true, host: "", app: "", body: t.replace(/^<\d{1,3}>/, ""), bodyOffset: m ? m[0].length : 0 };
}

const pv = (value: string | undefined, raw: string, from = 0): ParsedValue => {
  const v = value ?? "";
  const i = v ? raw.indexOf(v, from) : -1;
  return i >= 0 ? { value: v, span: [i, i + v.length] } : { value: v };
};

const ciscoAsa: ParserDef = {
  name: "cisco-asa-parser",
  version: "1.0",
  supports: (raw) => (/%ASA-\d-\d{6}:/.test(raw.raw_text) ? 0.99 : 0),
  parse(raw) {
    const t = raw.raw_text;
    const h = syslogHeader(t, raw.received_at);
    const m = /%ASA-(\d)-(\d{6}):\s*(.*)$/.exec(t);
    const level = m?.[1] ?? "6";
    const msgid = m?.[2] ?? "";
    const msg = m?.[3] ?? "";
    const f: Record<string, ParsedValue> = { msgid: pv(msgid, t), level: pv(level, t, t.indexOf("%ASA")), message: pv(msg, t) };
    let x: RegExpExecArray | null;
    if ((x = /^Deny (\w+) src [^:]+:([\d.:a-fA-F]+)\/(\d+) dst [^:]+:([\d.:a-fA-F]+)\/(\d+)(?: by access-group "([^"]+)")?/.exec(msg))) {
      Object.assign(f, { action: pv("Deny", t), protocol: pv(x[1], t), src_ip: pv(x[2], t), src_port: pv(x[3], t, t.indexOf(x[2] as string)), dst_ip: pv(x[4], t), dst_port: pv(x[5], t, t.indexOf(x[4] as string)) });
      if (x[6]) f["acl"] = pv(x[6], t);
    } else if ((x = /^Built (inbound|outbound) (TCP|UDP) connection (\d+) for [^:]+:([\d.]+)\/(\d+).*? to [^:]+:([\d.]+)\/(\d+)/.exec(msg))) {
      const outbound = x[1] === "outbound";
      Object.assign(f, {
        action: pv("Built", t), direction: pv(x[1], t), protocol: pv(x[2], t), conn_id: pv(x[3], t),
        src_ip: pv(outbound ? x[6] : x[4], t), src_port: pv(outbound ? x[7] : x[5], t),
        dst_ip: pv(outbound ? x[4] : x[6], t), dst_port: pv(outbound ? x[5] : x[7], t),
      });
    } else if ((x = /AAA user authentication (Rejected|Successful).*?user = (\S+?)(?: :|$).*?(?:user IP = ([\d.]+))?/i.exec(msg))) {
      Object.assign(f, { action: pv(x[1] === "Rejected" ? "auth-reject" : "auth-success", t), user: pv(x[2], t) });
      if (x[3]) f["src_ip"] = pv(x[3], t);
    }
    return {
      parser: { name: this.name, version: this.version }, format: "syslog", fields: f,
      source_key: `device:${h.host || "cisco-asa"}`, device_id: h.host || "", event_time: h.time, time_inferred: h.inferred,
      vendor: "Cisco", product: "ASA", source_type: "firewall", builtin_mapping: "cisco-asa",
    };
  },
};

const fortinet: ParserDef = {
  name: "fortinet-parser",
  version: "2.1",
  supports: (raw) => (/\bdevname=/.test(raw.raw_text) && /\blogid=/.test(raw.raw_text) ? 0.98 : 0),
  parse(raw) {
    const t = raw.raw_text;
    const start = t.search(/\S+=/);
    const f = parseKv(t.slice(Math.max(0, start)), Math.max(0, start));
    const date = f["date"]?.value;
    const time = f["time"]?.value;
    const et = date && time ? isoOrNull(`${date}T${time}Z`) : null;
    const dev = f["devname"]?.value ?? "fortigate";
    return {
      parser: { name: this.name, version: this.version }, format: "kv", fields: f,
      source_key: `device:${dev}`, device_id: dev, event_time: et ?? raw.received_at, time_inferred: !et,
      vendor: "Fortinet", product: "FortiGate", source_type: "firewall", builtin_mapping: "fortinet-fgt",
    };
  },
};

const cef: ParserDef = {
  name: "cef-parser",
  version: "1.0",
  supports: (_r, c) => has(c, "cef"),
  parse(raw) {
    const t = raw.raw_text;
    const base = t.indexOf("CEF:");
    const parts: string[] = [];
    let cur = "";
    let i = base;
    for (; i < t.length && parts.length < 7; i++) {
      const ch = t[i] as string;
      if (ch === "\\" && i + 1 < t.length) { cur += t[++i]; continue; }
      if (ch === "|") { parts.push(cur); cur = ""; continue; }
      cur += ch;
    }
    const [, vendor, product, version, sigId, name, severity] = parts;
    const f: Record<string, ParsedValue> = {
      cef_vendor: pv(vendor, t), cef_product: pv(product, t), cef_version: pv(version, t),
      signature_id: pv(sigId, t), name: pv(name, t), severity: pv(severity, t, base + 5),
    };
    // CEF extension: values may contain spaces; key starts at " key="
    const ext = t.slice(i);
    const re = /(?:^|\s)([A-Za-z0-9_]+)=/g;
    const keys: { k: string; s: number; vs: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(ext))) keys.push({ k: m[1] as string, s: m.index, vs: m.index + m[0].length });
    keys.forEach((k, idx) => {
      const end = idx + 1 < keys.length ? (keys[idx + 1] as { s: number }).s : ext.length;
      const value = ext.slice(k.vs, end).trim();
      f[k.k] = { value, span: [i + k.vs, i + k.vs + value.length] };
    });
    const rt = f["rt"]?.value;
    const et = rt ? (/^\d{12,}$/.test(rt) ? new Date(+rt).toISOString() : isoOrNull(rt)) : null;
    const dev = f["dvchost"]?.value ?? f["dvc"]?.value ?? `${slug(vendor ?? "cef")}-${slug(product ?? "")}`;
    return {
      parser: { name: this.name, version: this.version }, format: "cef", fields: f,
      source_key: `device:${dev}`, device_id: dev, event_time: et ?? raw.received_at, time_inferred: !et,
      vendor: vendor ?? "", product: product ?? "", source_type: "security", builtin_mapping: "cef-generic",
    };
  },
};

const leef: ParserDef = {
  name: "leef-parser",
  version: "1.0",
  supports: (_r, c) => has(c, "leef"),
  parse(raw) {
    const t = raw.raw_text;
    const base = t.indexOf("LEEF:");
    const head = t.slice(base).split("|");
    const isV2 = head[0] === "LEEF:2.0";
    const nHead = isV2 ? 6 : 5;
    const headerLen = head.slice(0, nHead).join("|").length + 1;
    let delim = "\t";
    if (isV2 && head[5] && head[5].length <= 4 && !head[5].includes("=")) {
      delim = head[5].startsWith("x") || head[5].startsWith("0x") ? String.fromCharCode(parseInt(head[5].replace(/^0?x/, ""), 16)) : head[5];
    }
    const attrStart = base + (isV2 && head[5] && !head[5].includes("=") ? headerLen : head.slice(0, 5).join("|").length + 1);
    const attrs = t.slice(attrStart);
    const f: Record<string, ParsedValue> = { leef_vendor: pv(head[1], t), leef_product: pv(head[2], t), leef_version: pv(head[3], t), event_id: pv(head[4], t) };
    let pos = attrStart;
    for (const pair of attrs.split(delim.length ? delim : "\t")) {
      const eq = pair.indexOf("=");
      if (eq > 0) {
        const k = pair.slice(0, eq).trim();
        const v = pair.slice(eq + 1);
        f[k] = { value: v, span: [pos + eq + 1, pos + eq + 1 + v.length] };
      }
      pos += pair.length + 1;
    }
    const dev = f["devName"]?.value ?? `${slug(head[1] ?? "leef")}-${slug(head[2] ?? "")}`;
    const dt = f["devTime"]?.value;
    const et = dt ? isoOrNull(dt) : null;
    return {
      parser: { name: this.name, version: this.version }, format: "leef", fields: f,
      source_key: `device:${dev}`, device_id: dev, event_time: et ?? raw.received_at, time_inferred: !et,
      vendor: head[1] ?? "", product: head[2] ?? "", source_type: "security", builtin_mapping: "leef-generic",
    };
  },
};

const genericJson: ParserDef = {
  name: "generic-json-parser",
  version: "1.0",
  supports: (_r, c) => (has(c, "json") > 0.9 ? 0.6 : 0),
  parse(raw) {
    const obj = JSON.parse(raw.raw_text.trim()) as Record<string, unknown>;
    const f = flattenJson(obj, "", {}, raw.raw_text);
    const host = String(obj["host"] ?? obj["hostname"] ?? obj["device"] ?? obj["observer"] ?? "");
    const keys = Object.keys(f).sort().join(",");
    return {
      parser: { name: this.name, version: this.version }, format: "json", fields: f,
      source_key: host ? `device:${host}` : `json:${keys.slice(0, 80)}`, device_id: host,
      event_time: raw.received_at, time_inferred: true,
    };
  },
};

const genericCsv: ParserDef = {
  name: "generic-csv-parser",
  version: "1.0",
  supports: (_r, c) => (has(c, "csv") ? 0.9 : 0),
  parse(raw) {
    const header = raw.ingestion_context.csv_header ?? [];
    const cols = splitCsv(raw.raw_text);
    const f: Record<string, ParsedValue> = {};
    let pos = 0;
    header.forEach((h, i) => {
      const v = cols[i] ?? "";
      const at = raw.raw_text.indexOf(v, pos);
      f[h] = at >= 0 ? { value: v, span: [at, at + v.length] } : { value: v };
      if (at >= 0) pos = at + v.length;
    });
    const hostCol = header.find((h) => /^(host|hostname|device|devname)$/i.test(h));
    const host = hostCol ? f[hostCol]?.value ?? "" : "";
    return {
      parser: { name: this.name, version: this.version }, format: "csv", fields: f,
      source_key: host ? `device:${host}` : `csv:${header.join(",").slice(0, 80)}`, device_id: host,
      event_time: raw.received_at, time_inferred: true,
    };
  },
};

const genericKv: ParserDef = {
  name: "generic-kv-parser",
  version: "1.0",
  supports: (raw, c) => {
    const s = has(c, "kv");
    if (s) return s * 0.7;
    // syslog wrapping kv body
    if (has(c, "syslog")) return kvRatio(syslogHeader(raw.raw_text, raw.received_at).body) >= 0.3 ? 0.7 : 0;
    return 0;
  },
  parse(raw) {
    let t = raw.raw_text;
    let off = 0;
    let host = "";
    let et: string | null = null;
    let inferred = true;
    if (/^<\d{1,3}>/.test(t)) {
      const h = syslogHeader(t, raw.received_at);
      host = h.host; et = h.time; inferred = h.inferred; off = h.bodyOffset; t = h.body;
    }
    const firstKv = t.search(/[A-Za-z0-9_.\-@]+=/);
    const prefix = firstKv > 0 ? t.slice(0, firstKv).trim() : "";
    // Prefix like "2026-09-28 10:31:21 FW01"
    const pm = /^(\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d(?:\.\d+)?Z?)\s+(\S+)?/.exec(prefix);
    if (pm) {
      et = isoOrNull(pm[1] as string) ?? et;
      inferred = !et;
      if (pm[2]) host = pm[2];
    } else if (prefix && !host) {
      const tok = prefix.split(/\s+/).pop() ?? "";
      if (/^[A-Za-z][\w.-]{1,40}$/.test(tok)) host = tok;
    }
    const f = parseKv(t.slice(Math.max(0, firstKv)), off + Math.max(0, firstKv));
    if (host && !f["host"]) {
      const at = raw.raw_text.indexOf(host);
      f["_host"] = at >= 0 ? { value: host, span: [at, at + host.length] } : { value: host };
    }
    const keys = Object.keys(f).filter((k) => k !== "_host").sort().join(",");
    return {
      parser: { name: this.name, version: this.version }, format: "kv", fields: f,
      source_key: host ? `device:${host}` : `kv:${keys.slice(0, 80)}`, device_id: host,
      event_time: et ?? raw.received_at, time_inferred: inferred || !et,
    };
  },
};

const genericSyslog: ParserDef = {
  name: "generic-syslog-parser",
  version: "1.0",
  supports: (_r, c) => has(c, "syslog") * 0.5,
  parse(raw) {
    const h = syslogHeader(raw.raw_text, raw.received_at);
    const t = raw.raw_text;
    const tag = /^([\w\-/.]+)(?:\[\d+\])?:\s*/.exec(h.body);
    const app = h.app || tag?.[1] || "";
    const msg = tag ? h.body.slice(tag[0].length) : h.body;
    const f: Record<string, ParsedValue> = { pri: pv(String(h.pri), t), message: pv(msg, t) };
    if (app) f["app"] = pv(app, t);
    if (h.host) f["host"] = pv(h.host, t);
    return {
      parser: { name: this.name, version: this.version }, format: "syslog", fields: f,
      source_key: `device:${h.host || "syslog"}`, device_id: h.host, event_time: h.time, time_inferred: h.inferred,
      source_type: "network", builtin_mapping: "syslog-generic",
    };
  },
};

const genericRaw: ParserDef = {
  name: "generic-raw-parser",
  version: "1.0",
  supports: () => 0.01,
  parse(raw) {
    return {
      parser: { name: this.name, version: this.version }, format: "text", fields: {},
      source_key: "unknown:text", event_time: raw.received_at, time_inferred: true,
    };
  },
};

export const PARSERS: ParserDef[] = [ciscoAsa, fortinet, cef, leef, genericCsv, genericJson, genericKv, genericSyslog, genericRaw];

export function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] as string;
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === "," && !q) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Registry: rank all parsers by score, record the decision so choice is explainable. */
export function selectAndParse(raw: RawEvent): { parsed: ParsedEvent; candidates: FormatCandidate[] } {
  const safe: RawEvent = raw.raw_text.length > MAX_PARSE_LEN ? { ...raw, raw_text: raw.raw_text.slice(0, MAX_PARSE_LEN) } : raw;
  const candidates = detectFormats(safe);
  const scored = PARSERS.map((p) => ({ p, score: p.supports(safe, candidates) })).sort((a, b) => b.score - a.score);
  const best = scored[0] as { p: ParserDef; score: number };
  const top = candidates[0] as FormatCandidate;
  const out = best.p.parse(safe);
  return {
    candidates,
    parsed: {
      ...out,
      selection_reason: `${best.p.name} scored ${best.score.toFixed(2)}; detected ${top.format} (${top.reason})`,
      alternatives: scored.slice(1, 4).filter((s) => s.score > 0).map((s) => ({ name: s.p.name, score: +s.score.toFixed(2) })),
    },
  };
}
