// Declarative, versioned, vendor-blind normalization engine + built-in mappings + inference (KF1)
import type {
  FieldSuggestion, FieldType, LineageRecord, Mapping, MappingEntry, NormalizedEvent, ParsedEvent, RawEvent,
} from "./types";
import { uuidFromName } from "./hash";

const T0 = "2026-01-01T00:00:00.000Z";

const ACTION_MAP: Record<string, string> = {
  accept: "allow", allow: "allow", allowed: "allow", permit: "allow", pass: "allow", built: "allow", close: "allow",
  deny: "deny", denied: "deny", drop: "deny", dropped: "deny", block: "deny", blocked: "deny", reject: "deny",
  "client-rst": "reset", "server-rst": "reset", reset: "reset",
  "ssl-login-fail": "login_failure", "auth-reject": "login_failure", failed: "login_failure", "login-fail": "login_failure", failure: "login_failure",
  "tunnel-up": "login_success", "auth-success": "login_success", "login-success": "login_success", success: "login_success",
  alert: "alert", detected: "alert",
};

export const BUILTIN_MAPPINGS: Mapping[] = [
  {
    mapping_id: "cisco-asa", version: "1.0", parser: "cisco-asa-parser", builtin: true, created_at: T0,
    entries: [
      { source_field: "src_ip", target: "network.source_ip", type: "ip", confidence: 0.99, required: true },
      { source_field: "dst_ip", target: "network.destination_ip", type: "ip", confidence: 0.99 },
      { source_field: "src_port", target: "network.source_port", type: "port", confidence: 0.99 },
      { source_field: "dst_port", target: "network.destination_port", type: "port", confidence: 0.99 },
      { source_field: "protocol", target: "network.protocol", type: "protocol", confidence: 0.99 },
      { source_field: "direction", target: "network.direction", type: "string", confidence: 0.95 },
      { source_field: "action", target: "event.action", type: "enum", confidence: 0.97, required: true },
      { source_field: "level", target: "event.severity", type: "severity", confidence: 0.9 },
      { source_field: "msgid", target: "event.type", type: "string", confidence: 0.95 },
      { source_field: "acl", target: "rule.name", type: "string", confidence: 0.95 },
      { source_field: "user", target: "identity.username", type: "string", confidence: 0.95 },
    ],
  },
  {
    mapping_id: "fortinet-fgt", version: "2.1", parser: "fortinet-parser", builtin: true, created_at: T0,
    entries: [
      { source_field: "srcip", target: "network.source_ip", type: "ip", confidence: 0.99 },
      { source_field: "remip", target: "network.source_ip", type: "ip", confidence: 0.95 },
      { source_field: "dstip", target: "network.destination_ip", type: "ip", confidence: 0.99 },
      { source_field: "srcport", target: "network.source_port", type: "port", confidence: 0.99 },
      { source_field: "dstport", target: "network.destination_port", type: "port", confidence: 0.99 },
      { source_field: "proto", target: "network.protocol", type: "protocol", confidence: 0.97 },
      { source_field: "action", target: "event.action", type: "enum", confidence: 0.97, required: true },
      { source_field: "level", target: "event.severity", type: "severity", confidence: 0.95 },
      { source_field: "subtype", target: "event.type", type: "string", confidence: 0.9 },
      { source_field: "policyid", target: "rule.id", type: "string", confidence: 0.99 },
      { source_field: "policyname", target: "rule.name", type: "string", confidence: 0.99 },
      { source_field: "user", target: "identity.username", type: "string", confidence: 0.97 },
      { source_field: "devid", target: "source.device_ip", type: "string", confidence: 0.5 },
    ],
  },
  {
    mapping_id: "cef-generic", version: "1.0", parser: "cef-parser", builtin: true, created_at: T0,
    entries: [
      { source_field: "src", target: "network.source_ip", type: "ip", confidence: 0.99 },
      { source_field: "dst", target: "network.destination_ip", type: "ip", confidence: 0.99 },
      { source_field: "spt", target: "network.source_port", type: "port", confidence: 0.99 },
      { source_field: "dpt", target: "network.destination_port", type: "port", confidence: 0.99 },
      { source_field: "proto", target: "network.protocol", type: "protocol", confidence: 0.97 },
      { source_field: "act", target: "event.action", type: "enum", confidence: 0.95 },
      { source_field: "severity", target: "event.severity", type: "severity", confidence: 0.95 },
      { source_field: "name", target: "event.type", type: "string", confidence: 0.9 },
      { source_field: "signature_id", target: "rule.id", type: "string", confidence: 0.95 },
      { source_field: "suser", target: "identity.username", type: "string", confidence: 0.95 },
      { source_field: "dvc", target: "source.device_ip", type: "ip", confidence: 0.9 },
    ],
  },
  {
    mapping_id: "leef-generic", version: "1.0", parser: "leef-parser", builtin: true, created_at: T0,
    entries: [
      { source_field: "src", target: "network.source_ip", type: "ip", confidence: 0.99 },
      { source_field: "dst", target: "network.destination_ip", type: "ip", confidence: 0.99 },
      { source_field: "srcPort", target: "network.source_port", type: "port", confidence: 0.99 },
      { source_field: "dstPort", target: "network.destination_port", type: "port", confidence: 0.99 },
      { source_field: "proto", target: "network.protocol", type: "protocol", confidence: 0.97 },
      { source_field: "action", target: "event.action", type: "enum", confidence: 0.9 },
      { source_field: "sev", target: "event.severity", type: "severity", confidence: 0.9 },
      { source_field: "event_id", target: "event.type", type: "string", confidence: 0.9 },
      { source_field: "usrName", target: "identity.username", type: "string", confidence: 0.97 },
    ],
  },
  {
    mapping_id: "syslog-generic", version: "1.0", parser: "generic-syslog-parser", builtin: true, created_at: T0,
    entries: [
      { source_field: "pri", target: "event.severity", type: "severity", confidence: 0.8, transforms: ["severity_from_pri"] },
      { source_field: "app", target: "event.type", type: "string", confidence: 0.6 },
    ],
  },
];

// ---------- coercion + transforms (pure, named) ----------
const SYSLOG_LEVEL: Record<string, number> = {
  emerg: 10, emergency: 10, alert: 9, crit: 8, critical: 8, err: 7, error: 7, warning: 6, warn: 6, notice: 4, notification: 4, info: 2, information: 2, informational: 2, debug: 0,
};
const LEVEL_BY_NUM = [10, 9, 8, 7, 6, 4, 2, 0];
const PROTO_NUM: Record<string, string> = { "1": "icmp", "6": "tcp", "17": "udp", "47": "gre", "50": "esp", "58": "ipv6-icmp" };

export function isIp(v: string) {
  return /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(v) || (/^[0-9a-fA-F:]+$/.test(v) && v.includes("::") || /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/.test(v));
}
export function isPrivateIp(ip: string) {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.|169\.254\.)/.test(ip) || /^(fc|fd|fe80)/i.test(ip);
}
const SERVICES: Record<number, string> = { 20: "ftp-data", 21: "ftp", 22: "ssh", 23: "telnet", 25: "smtp", 53: "dns", 80: "http", 110: "pop3", 123: "ntp", 143: "imap", 443: "https", 445: "smb", 3306: "mysql", 3389: "rdp", 4444: "metasploit-default", 8080: "http-alt" };

interface Coerced { ok: boolean; value: string | number | null; transforms: string[] }

function coerce(raw: string, e: MappingEntry): Coerced {
  const v = raw.trim();
  const type: FieldType = e.type ?? "string";
  switch (type) {
    case "ip": {
      const x = v.replace(/^\[|\]$/g, "").toLowerCase();
      return isIp(x) ? { ok: true, value: x, transforms: ["ip_normalize"] } : { ok: false, value: null, transforms: [] };
    }
    case "port":
    case "int": {
      const n = Number(v);
      if (!Number.isInteger(n) || (type === "port" && (n < 0 || n > 65535))) return { ok: false, value: null, transforms: [] };
      return { ok: true, value: n, transforms: [`to_${type}`] };
    }
    case "protocol": {
      const p = PROTO_NUM[v] ?? v.toLowerCase();
      return { ok: /^[a-z0-9-]{2,12}$/.test(p), value: p, transforms: [PROTO_NUM[v] ? "protocol_number_to_name" : "protocol_lowercase"] };
    }
    case "enum": {
      const k = v.toLowerCase();
      const mapped = e.enum_map?.[k] ?? ACTION_MAP[k];
      return mapped ? { ok: true, value: mapped, transforms: ["enum_map"] } : { ok: true, value: k, transforms: ["lowercase"] };
    }
    case "severity": {
      const k = v.toLowerCase();
      if (e.transforms?.includes("severity_from_pri") && /^\d+$/.test(k)) return { ok: true, value: LEVEL_BY_NUM[+k % 8] ?? 2, transforms: ["severity_from_pri"] };
      if (SYSLOG_LEVEL[k] !== undefined) return { ok: true, value: SYSLOG_LEVEL[k] as number, transforms: ["severity_from_syslog_level"] };
      if (/^\d+$/.test(k)) {
        const n = +k;
        if (n <= 7 && e.source_field === "level") return { ok: true, value: LEVEL_BY_NUM[n] ?? 2, transforms: ["severity_from_syslog_level"] };
        return { ok: true, value: Math.min(10, n), transforms: ["severity_clamp_0_10"] };
      }
      if (k === "high") return { ok: true, value: 8, transforms: ["severity_word"] };
      if (k === "medium") return { ok: true, value: 5, transforms: ["severity_word"] };
      if (k === "low") return { ok: true, value: 2, transforms: ["severity_word"] };
      return { ok: false, value: null, transforms: [] };
    }
    case "timestamp": {
      const d = /^\d{12,}$/.test(v) ? new Date(+v) : /^\d{10}$/.test(v) ? new Date(+v * 1000) : new Date(v.includes("T") ? v : v.replace(" ", "T") + (/[zZ+]/.test(v) ? "" : "Z"));
      return isNaN(d.getTime()) ? { ok: false, value: null, transforms: [] } : { ok: true, value: d.toISOString(), transforms: ["to_utc_iso8601"] };
    }
    default:
      return { ok: true, value: v, transforms: [] };
  }
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i] as string;
    if (typeof cur[p] !== "object" || cur[p] === null) cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1] as string] = value;
}

function lookup(fields: ParsedEvent["fields"], name: string) {
  if (fields[name]) return { key: name, v: fields[name] };
  const lower = name.toLowerCase();
  const key = Object.keys(fields).find((k) => k.toLowerCase() === lower);
  return key ? { key, v: fields[key] } : null;
}

export function emptyEvent(raw: RawEvent, parsed: ParsedEvent): NormalizedEvent {
  return {
    event_id: uuidFromName("ulpf:event", raw.raw_event_id),
    schema: { name: "ULPF", version: "1.0" },
    timestamps: { event_time: parsed.event_time ?? raw.received_at, ingest_time: raw.received_at, event_time_inferred: parsed.time_inferred ?? true },
    source: { vendor: parsed.vendor ?? null, product: parsed.product ?? null, device_id: parsed.device_id || null, device_ip: null, source_type: parsed.source_type ?? null },
    event: { category: null, type: null, action: null, outcome: null, severity: null, original_severity: null },
    network: { source_ip: null, destination_ip: null, source_port: null, destination_port: null, protocol: null, direction: null },
    identity: { user_id: null, username: null },
    rule: { id: null, name: null },
    normalization: { status: "RAW_ONLY", mapping_id: null, mapping_version: null, quality: 0, uncertain_fields: [] },
    parser: { name: parsed.parser.name, version: parsed.parser.version, format: parsed.format, selection_reason: parsed.selection_reason },
    trace: { raw_event_id: raw.raw_event_id, ingestion_id: raw.ingestion_id, raw_sha256: raw.raw_sha256, source_key: parsed.source_key },
    lineage: {},
    enrichment: {},
    extensions: { vendor_specific: Object.fromEntries(Object.entries(parsed.fields).map(([k, v]) => [k, v.value])) },
  };
}

export function normalize(raw: RawEvent, parsed: ParsedEvent, mapping: Mapping, uncertainOverride: string[] = []): NormalizedEvent {
  const ev = emptyEvent(raw, parsed);
  const doc = ev as unknown as Record<string, unknown>;
  const used = new Set<string>();
  const uncertain = new Set<string>(uncertainOverride);
  const confs: number[] = [];
  let requiredMissing = 0;
  const requiredCount = mapping.entries.filter((e) => e.required).length;

  mapping.entries.forEach((e, idx) => {
    const hit = lookup(parsed.fields, e.source_field);
    if (!hit || hit.v === undefined || hit.v.value === "") {
      const alt = mapping.entries.some((o) => o !== e && o.target === e.target && lookup(parsed.fields, o.source_field));
      if (e.required && !alt) { requiredMissing++; uncertain.add(e.target); }
      return;
    }
    const current = e.target.split(".").reduce<unknown>((o, p) => (o as Record<string, unknown> | null)?.[p], doc);
    if (current !== null && current !== undefined && !e.target.startsWith("extensions")) { used.add(hit.key); return; } // first entry wins
    const c = coerce(hit.v.value, e);
    used.add(hit.key);
    if (!c.ok) { uncertain.add(e.target); return; }
    setPath(doc, e.target, c.value);
    if (e.target === "event.severity") ev.event.original_severity = hit.v.value;
    const lin: LineageRecord = { source_field: hit.key, mapping: `${mapping.mapping_id}@${mapping.version}#${idx + 1}`, transforms: [...(e.transforms ?? []), ...c.transforms].filter((t, i, a) => a.indexOf(t) === i), confidence: e.confidence, raw_value: hit.v.value };
    if (hit.v.span) lin.raw_span = hit.v.span;
    ev.lineage[e.target] = lin;
    confs.push(e.confidence);
  });

  // Unmapped fields are kept, never dropped
  ev.extensions.vendor_specific = Object.fromEntries(Object.entries(parsed.fields).filter(([k]) => !used.has(k)).map(([k, v]) => [k, v.value]));

  // Derived taxonomy (vendor-blind rules)
  const a = ev.event.action;
  if (a) {
    ev.event.outcome = a === "allow" || a === "login_success" ? "success" : a === "deny" || a === "login_failure" || a === "reset" ? "failure" : "unknown";
    ev.event.category = a.startsWith("login") ? "authentication" : a === "alert" ? "intrusion_detection" : "network";
    ev.event.type = ev.event.type ?? (a.startsWith("login") ? "authentication" : "connection");
  }
  // Enrichment: local-only, deterministic
  const n = ev.network;
  if (n.source_ip) ev.enrichment["source_ip_class"] = isPrivateIp(n.source_ip) ? "private" : "public";
  if (n.destination_ip) ev.enrichment["destination_ip_class"] = isPrivateIp(n.destination_ip) ? "private" : "public";
  if (n.destination_port !== null && SERVICES[n.destination_port]) ev.enrichment["destination_service"] = SERVICES[n.destination_port] as string;
  if (!n.direction && n.source_ip && n.destination_ip) {
    const s = isPrivateIp(n.source_ip), d = isPrivateIp(n.destination_ip);
    n.direction = s && !d ? "outbound" : !s && d ? "inbound" : s && d ? "internal" : "external";
  }

  const mappedCount = confs.length;
  const avg = mappedCount ? confs.reduce((x, y) => x + y, 0) / mappedCount : 0;
  const reqPenalty = requiredCount ? requiredMissing / requiredCount : 0;
  const uncPenalty = Math.min(0.5, uncertain.size * 0.1);
  ev.normalization = {
    status: mappedCount === 0 ? "RAW_ONLY" : uncertain.size || requiredMissing ? "PARTIAL" : "NORMALIZED",
    mapping_id: mapping.mapping_id,
    mapping_version: mapping.version,
    quality: +(avg * (1 - reqPenalty * 0.5) * (1 - uncPenalty)).toFixed(2),
    uncertain_fields: [...uncertain],
  };
  return ev;
}

// ---------- KF1: inference — suggest a mapping for an unknown source ----------
const ALIASES: [RegExp, string, FieldType?][] = [
  [/^(src|srcip|src_ip|sip|source_ip|source|client_ip|clientip|remip|src_addr|saddr|c_ip)$/i, "network.source_ip", "ip"],
  [/^(dst|dstip|dst_ip|dip|destination_ip|destination|dest_ip|dest|server_ip|daddr|dst_addr)$/i, "network.destination_ip", "ip"],
  [/^(spt|srcport|src_port|sport|source_port|client_port)$/i, "network.source_port", "port"],
  [/^(dpt|dstport|dst_port|dport|destination_port|dest_port|port|server_port)$/i, "network.destination_port", "port"],
  [/^(proto|protocol|ip_proto|transport)$/i, "network.protocol", "protocol"],
  [/^(act|action|decision|disposition|verdict|result|status)$/i, "event.action", "enum"],
  [/^(user|username|usrname|suser|account|user_name|login)$/i, "identity.username", "string"],
  [/^(severity|level|sev|priority|pri)$/i, "event.severity", "severity"],
  [/^(policy|rule|policyname|rule_name|acl|access_group)$/i, "rule.name", "string"],
  [/^(rule_id|policyid|sig_id|signature_id)$/i, "rule.id", "string"],
  [/^(timestamp|@timestamp|time|ts|datetime|event_time|date_time)$/i, "timestamps.event_time", "timestamp"],
  [/^(dest_host|dhost|url|domain|hostname_dst)$/i, "extensions.vendor_specific.destination_host", "string"],
  [/^(_host|host|hostname|devname|device)$/i, "source.device_id", "string"],
];

export function shapeOf(v: string): "ip" | "port" | "protocol" | "action" | "timestamp" | "number" | "string" {
  const x = v.trim();
  if (isIp(x)) return "ip";
  if (/^(tcp|udp|icmp|gre|esp)$/i.test(x)) return "protocol";
  if (ACTION_MAP[x.toLowerCase()]) return "action";
  if (/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d/.test(x) || /^\d{13}$/.test(x)) return "timestamp";
  if (/^\d{1,5}$/.test(x) && +x <= 65535) return "port";
  if (/^-?\d+(\.\d+)?$/.test(x)) return "number";
  return "string";
}

const SHAPE_TYPE: Record<string, FieldType> = { ip: "ip", port: "port", protocol: "protocol", action: "enum", timestamp: "timestamp", number: "int", string: "string" };

export function inferSuggestions(fields: ParsedEvent["fields"]): FieldSuggestion[] {
  const taken = new Set<string>();
  const out: FieldSuggestion[] = [];
  const entries = Object.entries(fields);
  // pass 1: name aliases
  for (const [k, v] of entries) {
    const al = ALIASES.find(([re]) => re.test(k));
    if (al && !taken.has(al[1])) {
      const shape = shapeOf(v.value);
      const expected = al[2];
      const agrees = !expected || expected === "string" || SHAPE_TYPE[shape] === expected || (expected === "severity") || (expected === "enum" && shape === "action");
      if (agrees) {
        taken.add(al[1]);
        out.push({ source_field: k, sample: v.value, target: al[1], confidence: 0.9, reason: `field name "${k}" matches alias dictionary; value shape ${shape}` });
        continue;
      }
    }
    out.push({ source_field: k, sample: v.value, target: null, confidence: 0, reason: "" });
  }
  // pass 2: value shape for the rest
  for (const s of out) {
    if (s.target) continue;
    const shape = shapeOf(s.sample);
    const pick = (t: string, c: number, why: string) => {
      if (!taken.has(t)) { taken.add(t); s.target = t; s.confidence = c; s.reason = why; return true; }
      return false;
    };
    if (shape === "ip") pick("network.source_ip", 0.6, "first IP-shaped value") || pick("network.destination_ip", 0.55, "second IP-shaped value");
    else if (shape === "protocol") pick("network.protocol", 0.8, "value is a protocol name");
    else if (shape === "action") pick("event.action", 0.8, "value is a known action verb");
    else if (shape === "timestamp") pick("timestamps.event_time", 0.75, "value parses as a timestamp");
    else if (shape === "port" && /port|pt$/i.test(s.source_field)) pick("network.destination_port", 0.6, "port-range integer with port-like name");
    if (!s.target) { s.target = null; s.confidence = 0; s.reason = `unrecognized (${shape}); kept in extensions`; }
  }
  return out;
}

export function mappingFromSuggestions(mappingId: string, version: string, sourceKey: string, suggestions: FieldSuggestion[]): Mapping {
  const entries: MappingEntry[] = suggestions
    .filter((s) => s.target && s.target !== "source.device_id")
    .map((s) => {
      const t = s.target as string;
      const al = ALIASES.find(([, target]) => target === t);
      const type: FieldType = al?.[2] ?? SHAPE_TYPE[shapeOf(s.sample)] ?? "string";
      const e: MappingEntry = { source_field: s.source_field, target: t, type, confidence: Math.max(0.5, s.confidence || 0.9) };
      return e;
    });
  const seen = new Set<string>();
  for (const e of entries) {
    if ((e.target === "network.source_ip" || e.target === "event.action") && !seen.has(e.target)) e.required = true;
    seen.add(e.target);
  }
  return { mapping_id: mappingId, version, parser: "generated", source_key: sourceKey, entries, created_at: new Date().toISOString(), approved_by: "analyst" };
}
