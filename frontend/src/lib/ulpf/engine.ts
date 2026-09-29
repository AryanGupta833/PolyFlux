// ULPF pipeline: ingest -> detect -> parse -> normalize -> validate/enrich -> store -> analytics.
// Pure functions over UlpfState so the same code runs in the browser dashboard and in server API routes.
import { sha256, uuidv7 } from "./hash";
import { selectAndParse, splitCsv } from "./parsers";
import { BUILTIN_MAPPINGS, emptyEvent, inferSuggestions, mappingFromSuggestions, normalize, shapeOf } from "./normalize";
import type { Alert, DriftReport, Mapping, NormalizedEvent, ParsedEvent, Proposal, RawEvent, UlpfState } from "./types";

export const MAX_EVENT_BYTES = 64 * 1024;
export const MAX_BATCH = 5000;
const MAX_STORED = 3000;

export function initialState(): UlpfState {
  return { raws: [], events: [], mappings: BUILTIN_MAPPINGS.map((m) => ({ ...m })), bindings: {}, proposals: [], drift: [], alerts: [], dlq: [], audit: [] };
}

const now = () => new Date().toISOString();
function audit(s: UlpfState, action: string, detail: string) {
  s.audit.unshift({ at: now(), action, detail });
  s.audit = s.audit.slice(0, 300);
}

// ---------- ingestion ----------
export interface IngestOptions { transport?: string; file?: string }

/** Split a payload into individual raw events (JSON array, NDJSON, CSV with header, or lines). */
export function splitPayload(text: string): { lines: string[]; csvHeader?: string[] } {
  const t = text.replace(/\r\n/g, "\n").trim();
  if (!t) return { lines: [] };
  if (t.startsWith("[")) {
    try {
      const arr = JSON.parse(t) as unknown[];
      if (Array.isArray(arr)) return { lines: arr.map((x) => (typeof x === "string" ? x : JSON.stringify(x))) };
    } catch { /* fall through */ }
  }
  const lines = t.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim().length > 0);
  const first = lines[0] ?? "";
  if (lines.length >= 2 && !/^[<{]/.test(first) && !first.includes("=") && first.split(",").length >= 3) {
    const n = splitCsv(first).length;
    const looksHeader = splitCsv(first).every((h) => /^[A-Za-z_][\w .-]*$/.test(h));
    const consistent = lines.slice(1, 6).every((l) => splitCsv(l).length === n);
    if (looksHeader && consistent) return { lines: lines.slice(1), csvHeader: splitCsv(first) };
  }
  return { lines };
}

export function makeRaw(text: string, ingestionId: string, opts: IngestOptions, line?: number, csvHeader?: string[]): RawEvent {
  const bytes = new TextEncoder().encode(text);
  const ctx: RawEvent["ingestion_context"] = {};
  if (opts.file) ctx.file = opts.file;
  if (line !== undefined) ctx.line = line;
  if (csvHeader) ctx.csv_header = csvHeader;
  return {
    raw_event_id: uuidv7(),
    ingestion_id: ingestionId,
    raw_text: text,
    raw_sha256: sha256(text), // hash computed on exact bytes before any trimming
    byte_length: bytes.length,
    received_at: now(),
    transport: opts.transport ?? "http",
    ingestion_context: ctx,
  };
}

export function verifyRaw(raw: RawEvent): boolean {
  return sha256(raw.raw_text) === raw.raw_sha256;
}

export interface IngestResult { ingestion_id: string; accepted: number; rejected: number; events: NormalizedEvent[] }

export function ingest(s: UlpfState, text: string, opts: IngestOptions = {}): IngestResult {
  const ingestionId = uuidv7();
  const { lines, csvHeader } = splitPayload(text);
  let rejected = 0;
  const out: NormalizedEvent[] = [];
  lines.slice(0, MAX_BATCH).forEach((line, i) => {
    if (new TextEncoder().encode(line).length > MAX_EVENT_BYTES) { rejected++; return; }
    const raw = makeRaw(line, ingestionId, opts, csvHeader ? i + 2 : i + 1, csvHeader);
    s.raws.push(raw);
    const ev = processRaw(s, raw);
    if (ev) out.push(ev);
  });
  rejected += Math.max(0, lines.length - MAX_BATCH);
  if (s.raws.length > MAX_STORED) {
    const drop = new Set(s.raws.slice(0, s.raws.length - MAX_STORED).map((r) => r.raw_event_id));
    s.raws = s.raws.slice(-MAX_STORED);
    s.events = s.events.filter((e) => !drop.has(e.trace.raw_event_id));
  }
  audit(s, "ingest", `${out.length} events via ${opts.transport ?? "http"}${opts.file ? ` (${opts.file})` : ""}`);
  return { ingestion_id: ingestionId, accepted: out.length, rejected, events: out };
}

// ---------- processing ----------
function findMapping(s: UlpfState, id: string, version?: string): Mapping | undefined {
  const all = s.mappings.filter((m) => m.mapping_id === id);
  if (version) return all.find((m) => m.version === version);
  return all.sort((a, b) => parseFloat(b.version) - parseFloat(a.version))[0];
}

function upsertEvent(s: UlpfState, ev: NormalizedEvent) {
  const i = s.events.findIndex((e) => e.event_id === ev.event_id); // idempotent by deterministic event_id
  if (i >= 0) s.events[i] = ev;
  else s.events.push(ev);
}

export function processRaw(s: UlpfState, raw: RawEvent, opts: { skipAnalytics?: boolean } = {}): NormalizedEvent | null {
  let stage = "detect";
  try {
    stage = "parse";
    const { parsed } = selectAndParse(raw);
    stage = "normalize";
    const binding = s.bindings[parsed.source_key];
    let ev: NormalizedEvent;
    if (binding && !parsed.builtin_mapping) {
      const m = findMapping(s, binding.mapping_id, binding.version);
      if (!m) throw new Error(`bound mapping ${binding.mapping_id}@${binding.version} missing`);
      const drift = detectDrift(parsed, m);
      ev = normalize(raw, parsed, m, drift ? drift.affected_targets : []);
      if (drift) recordDrift(s, parsed, m, drift, ev);
    } else if (parsed.builtin_mapping) {
      const m = findMapping(s, parsed.builtin_mapping) as Mapping;
      ev = normalize(raw, parsed, m);
    } else {
      ev = emptyEvent(raw, parsed);
      ev.normalization.status = "RAW_ONLY";
      if (Object.keys(parsed.fields).length >= 2) proposeForUnknown(s, parsed, raw);
    }
    stage = "store";
    upsertEvent(s, ev);
    s.dlq = s.dlq.filter((d) => d.raw_event_id !== raw.raw_event_id);
    if (!opts.skipAnalytics) { stage = "analytics"; runAnalytics(s, ev); }
    return ev;
  } catch (e) {
    const prev = s.dlq.find((d) => d.raw_event_id === raw.raw_event_id);
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    if (prev) { prev.attempts++; prev.at = now(); prev.error = msg; }
    else s.dlq.push({ raw_event_id: raw.raw_event_id, stage, error: msg, attempts: 1, at: now() });
    return null;
  }
}

export function reprocess(s: UlpfState, filter?: (r: RawEvent) => boolean): number {
  let n = 0;
  for (const r of s.raws) {
    if (filter && !filter(r)) continue;
    processRaw(s, r, { skipAnalytics: true });
    n++;
  }
  rebuildAnalytics(s);
  return n;
}

// ---------- KF1: human-in-the-loop self-evolving parser ----------
function proposeForUnknown(s: UlpfState, parsed: ParsedEvent, raw: RawEvent) {
  const existing = s.proposals.find((p) => p.source_key === parsed.source_key && p.status === "pending");
  if (existing) {
    if (!existing.evidence_raw_ids.includes(raw.raw_event_id)) existing.evidence_raw_ids.push(raw.raw_event_id);
    return;
  }
  s.proposals.unshift({
    id: uuidv7(), kind: "new_source", source_key: parsed.source_key, status: "pending", created_at: now(),
    suggestions: inferSuggestions(parsed.fields), evidence_raw_ids: [raw.raw_event_id],
  });
  audit(s, "proposal.created", `unknown source ${parsed.source_key}`);
}

export function approveProposal(s: UlpfState, id: string, suggestions?: Proposal["suggestions"]): Mapping | null {
  const p = s.proposals.find((x) => x.id === id);
  if (!p || p.status !== "pending") return null;
  if (suggestions) p.suggestions = suggestions;
  let mapping: Mapping;
  if (p.base_mapping) {
    const nextVer = `${Math.floor(parseFloat(p.base_mapping.version)) + 1}.0`;
    mapping = mappingFromSuggestions(p.base_mapping.mapping_id, nextVer, p.source_key, p.suggestions);
  } else {
    const mid = `gen-${p.source_key.replace(/^[a-z]+:/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
    mapping = mappingFromSuggestions(mid, "1.0", p.source_key, p.suggestions);
  }
  s.mappings.push(mapping);
  s.bindings[p.source_key] = { mapping_id: mapping.mapping_id, version: mapping.version };
  p.status = "approved";
  p.decided_at = now();
  audit(s, "proposal.approved", `${mapping.mapping_id}@${mapping.version} bound to ${p.source_key}`);
  // Reprocess earlier events of this source from raw
  const keys = new Set(s.events.filter((e) => e.trace.source_key === p.source_key).map((e) => e.trace.raw_event_id));
  const n = reprocess(s, (r) => keys.has(r.raw_event_id));
  audit(s, "reprocess", `${n} raw events re-normalized from raw for ${p.source_key}`);
  return mapping;
}

export function rejectProposal(s: UlpfState, id: string) {
  const p = s.proposals.find((x) => x.id === id);
  if (!p) return;
  p.status = "rejected";
  p.decided_at = now();
  audit(s, "proposal.rejected", p.source_key);
}

// ---------- KF3: schema drift detection ----------
function detectDrift(parsed: ParsedEvent, m: Mapping): Omit<DriftReport, "id" | "created_at" | "event_id" | "source_key" | "mapping_id" | "from_version"> | null {
  const present = new Set(Object.keys(parsed.fields).map((k) => k.toLowerCase()));
  const mappedFields = new Set(m.entries.map((e) => e.source_field.toLowerCase()));
  const satisfied = new Set(m.entries.filter((e) => present.has(e.source_field.toLowerCase())).map((e) => e.target));
  const missing = m.entries.filter((e) => !present.has(e.source_field.toLowerCase()) && !satisfied.has(e.target));
  const added = Object.keys(parsed.fields).filter((k) => !mappedFields.has(k.toLowerCase()) && k !== "_host");
  if (!missing.length) return null;
  const renames: DriftReport["renames"] = [];
  const usedAdded = new Set<string>();
  for (const e of missing) {
    const expected = e.type === "enum" ? "action" : e.type;
    const cand = added.find((a) => !usedAdded.has(a) && (shapeOf((parsed.fields[a] as { value: string }).value) === expected || (expected === "string")));
    if (cand) {
      usedAdded.add(cand);
      renames.push({ from: e.source_field, to: cand, confidence: expected === "string" ? 0.4 : 0.8, reason: `value shape ${shapeOf((parsed.fields[cand] as { value: string }).value)} matches ${e.target}` });
    }
  }
  const score = +(missing.length / Math.max(1, m.entries.length)).toFixed(2);
  return { score, missing: missing.map((e) => e.source_field), added, renames, affected_targets: missing.map((e) => e.target) };
}

function recordDrift(s: UlpfState, parsed: ParsedEvent, m: Mapping, d: NonNullable<ReturnType<typeof detectDrift>>, ev: NormalizedEvent) {
  const sig = `${parsed.source_key}|${d.missing.join(",")}|${d.added.join(",")}`;
  const existing = s.drift.find((r) => `${r.source_key}|${r.missing.join(",")}|${r.added.join(",")}` === sig && r.from_version === m.version);
  if (existing) return;
  const report: DriftReport = { id: uuidv7(), source_key: parsed.source_key, mapping_id: m.mapping_id, from_version: m.version, created_at: now(), event_id: ev.event_id, ...d };
  // Suggested mapping v(n+1) through the same approval flow as KF1
  const suggestions = [
    ...m.entries.map((e) => {
      const r = d.renames.find((x) => x.from === e.source_field);
      return { source_field: r ? r.to : e.source_field, sample: r ? (parsed.fields[r.to]?.value ?? "") : (parsed.fields[e.source_field]?.value ?? ""), target: e.target, confidence: r ? r.confidence : e.confidence, reason: r ? `renamed from "${r.from}" (${r.reason})` : "unchanged" };
    }),
    // keep old names as well so both formats keep working
    ...d.renames.map((r) => ({ source_field: r.from, sample: "", target: m.entries.find((e) => e.source_field === r.from)?.target ?? null, confidence: 0.9, reason: "legacy alias kept for backward compatibility" })),
  ];
  const proposal: Proposal = { id: uuidv7(), kind: "drift", source_key: parsed.source_key, status: "pending", created_at: now(), base_mapping: { mapping_id: m.mapping_id, version: m.version }, suggestions, evidence_raw_ids: [ev.trace.raw_event_id], drift_id: report.id };
  report.proposal_id = proposal.id;
  s.drift.unshift(report);
  s.proposals.unshift(proposal);
  audit(s, "drift.detected", `${parsed.source_key} score ${d.score}: ${d.renames.map((r) => `${r.from}→${r.to}`).join(", ") || d.missing.join(", ")}`);
}

// ---------- Rule analytics (demonstrations on normalized data) ----------
const WINDOW_MS = 15 * 60 * 1000;

function addAlert(s: UlpfState, a: Omit<Alert, "id" | "created_at">) {
  const ex = s.alerts.find((x) => x.key === a.key);
  if (ex) { ex.evidence = [...new Set([...ex.evidence, ...a.evidence])]; return; }
  s.alerts.unshift({ ...a, id: uuidv7(), created_at: now() });
}

export function runAnalytics(s: UlpfState, ev: NormalizedEvent) {
  const t = Date.parse(ev.timestamps.event_time);
  const recent = s.events.filter((e) => Math.abs(Date.parse(e.timestamps.event_time) - t) <= WINDOW_MS);
  const src = ev.network.source_ip;
  if (src && ev.event.action === "deny") {
    const denies = recent.filter((e) => e.network.source_ip === src && e.event.action === "deny");
    const ports = new Set(denies.map((e) => e.network.destination_port).filter((p) => p !== null));
    if (ports.size >= 5)
      addAlert(s, { key: `scan:${src}`, rule: "PORT_SCAN", severity: 7, title: `Port scan from ${src}`, description: `${ports.size} distinct destination ports denied within 15 min`, entities: [`ip:${src}`], evidence: denies.map((e) => e.event_id) });
  }
  const who = ev.identity.username ?? src;
  if (who && (ev.event.action === "login_failure" || ev.event.action === "login_success")) {
    const fails = recent.filter((e) => e.event.action === "login_failure" && (e.identity.username === who || e.network.source_ip === who));
    if (fails.length >= 3) {
      const ents = [...new Set(fails.flatMap((e) => [e.identity.username && `user:${e.identity.username}`, e.network.source_ip && `ip:${e.network.source_ip}`]).filter(Boolean) as string[])];
      addAlert(s, { key: `brute:${who}`, rule: "BRUTE_FORCE", severity: 8, title: `Brute force against ${who}`, description: `${fails.length} authentication failures within 15 min`, entities: ents, evidence: fails.map((e) => e.event_id) });
      if (ev.event.action === "login_success")
        addAlert(s, { key: `compromise:${who}`, rule: "LOGIN_AFTER_BRUTE_FORCE", severity: 9, title: `Successful login after brute force: ${who}`, description: "Authentication succeeded after repeated failures — possible compromise", entities: [...ents, ...(src ? [`ip:${src}`] : [])], evidence: [...fails.map((e) => e.event_id), ev.event_id] });
    }
  }
  // Outbound allowed connection to an IP flagged by another alert
  const dst = ev.network.destination_ip;
  if (dst && ev.event.action === "allow" && ev.network.direction === "outbound") {
    const flagged = s.alerts.filter((a) => a.entities.includes(`ip:${dst}`) && a.rule !== "SUSPICIOUS_OUTBOUND");
    if (flagged.length)
      addAlert(s, { key: `c2:${ev.network.source_ip}->${dst}`, rule: "SUSPICIOUS_OUTBOUND", severity: 9, title: `Internal host ${ev.network.source_ip} connected to hostile ${dst}`, description: `Outbound connection to an IP involved in: ${flagged.map((a) => a.rule).join(", ")}`, entities: [`ip:${ev.network.source_ip}`, `ip:${dst}`], evidence: [ev.event_id, ...flagged.flatMap((a) => a.evidence.slice(0, 3))] });
  }
}

export function rebuildAnalytics(s: UlpfState) {
  s.alerts = [];
  const sorted = [...s.events].sort((a, b) => a.timestamps.event_time.localeCompare(b.timestamps.event_time));
  for (const e of sorted) runAnalytics(s, e);
}

// ---------- KF4: correlation graph ----------
export interface GraphNode { id: string; type: "ip" | "device" | "user" | "alert"; label: string; events: string[]; severity?: number }
export interface GraphEdge { from: string; to: string; kind: string; events: string[] }

export function buildGraph(s: UlpfState, focus?: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const node = (id: string, type: GraphNode["type"], label: string, ev?: string) => {
    const n = nodes.get(id) ?? { id, type, label, events: [] };
    if (ev && !n.events.includes(ev)) n.events.push(ev);
    nodes.set(id, n);
  };
  const edge = (from: string, to: string, kind: string, ev: string) => {
    const k = `${from}|${to}|${kind}`;
    const e = edges.get(k) ?? { from, to, kind, events: [] };
    if (!e.events.includes(ev)) e.events.push(ev);
    edges.set(k, e);
  };
  for (const e of s.events) {
    if (e.normalization.status === "RAW_ONLY") continue;
    const { source_ip: si, destination_ip: di } = e.network;
    const dev = e.source.device_id;
    const user = e.identity.username;
    if (si) node(`ip:${si}`, "ip", si, e.event_id);
    if (di) node(`ip:${di}`, "ip", di, e.event_id);
    if (dev) node(`device:${dev}`, "device", dev, e.event_id);
    if (user) node(`user:${user}`, "user", user, e.event_id);
    if (si && di) edge(`ip:${si}`, `ip:${di}`, e.event.action ?? "conn", e.event_id);
    if (dev && si) edge(`device:${dev}`, `ip:${si}`, "observed", e.event_id);
    if (user && si) edge(`user:${user}`, `ip:${si}`, e.event.action ?? "auth", e.event_id);
  }
  for (const a of s.alerts) {
    node(`alert:${a.id}`, "alert", a.rule, undefined);
    const n = nodes.get(`alert:${a.id}`) as GraphNode;
    n.events = a.evidence;
    n.severity = a.severity;
    for (const ent of a.entities) if (nodes.has(ent)) edge(`alert:${a.id}`, ent, "implicates", a.evidence[0] ?? "");
  }
  let ns = [...nodes.values()];
  let es = [...edges.values()];
  if (focus && nodes.has(focus)) {
    const keep = new Set([focus]);
    es.forEach((e) => { if (e.from === focus) keep.add(e.to); if (e.to === focus) keep.add(e.from); });
    ns = ns.filter((n) => keep.has(n.id));
    es = es.filter((e) => keep.has(e.from) && keep.has(e.to));
  }
  return { nodes: ns, edges: es };
}
