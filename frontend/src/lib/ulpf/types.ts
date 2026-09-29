// Core ULPF domain types (Universal Event Schema v1.0 and pipeline objects)

export type Format = "json" | "cef" | "leef" | "syslog" | "csv" | "kv" | "text";
export type Status = "NORMALIZED" | "PARTIAL" | "RAW_ONLY";

export interface RawEvent {
  raw_event_id: string;
  ingestion_id: string;
  raw_text: string;
  raw_sha256: string;
  byte_length: number;
  received_at: string;
  transport: string;
  ingestion_context: { file?: string; line?: number; csv_header?: string[] };
}

export interface ParsedValue {
  value: string;
  span?: [number, number];
}

export interface FormatCandidate {
  format: Format;
  confidence: number;
  reason: string;
}

export interface ParsedEvent {
  parser: { name: string; version: string };
  format: Format;
  fields: Record<string, ParsedValue>;
  source_key: string;
  device_id?: string;
  event_time?: string;
  time_inferred?: boolean;
  vendor?: string;
  product?: string;
  source_type?: string;
  selection_reason: string;
  alternatives: { name: string; score: number }[];
  builtin_mapping?: string;
}

export type FieldType =
  | "ip"
  | "port"
  | "int"
  | "string"
  | "enum"
  | "protocol"
  | "timestamp"
  | "severity";

export interface MappingEntry {
  source_field: string;
  target: string;
  type?: FieldType;
  enum_map?: Record<string, string>;
  required?: boolean;
  confidence: number;
  transforms?: string[];
}

export interface Mapping {
  mapping_id: string;
  version: string;
  parser: string;
  source_key?: string;
  entries: MappingEntry[];
  created_at: string;
  approved_by?: string;
  builtin?: boolean;
}

export interface LineageRecord {
  source_field: string;
  mapping: string;
  transforms: string[];
  confidence: number;
  raw_span?: [number, number];
  raw_value: string;
}

export interface NormalizedEvent {
  event_id: string;
  schema: { name: "ULPF"; version: "1.0" };
  timestamps: { event_time: string; ingest_time: string; event_time_inferred: boolean };
  source: {
    vendor: string | null;
    product: string | null;
    device_id: string | null;
    device_ip: string | null;
    source_type: string | null;
  };
  event: {
    category: string | null;
    type: string | null;
    action: string | null;
    outcome: string | null;
    severity: number | null;
    original_severity: string | null;
  };
  network: {
    source_ip: string | null;
    destination_ip: string | null;
    source_port: number | null;
    destination_port: number | null;
    protocol: string | null;
    direction: string | null;
  };
  identity: { user_id: string | null; username: string | null };
  rule: { id: string | null; name: string | null };
  normalization: {
    status: Status;
    mapping_id: string | null;
    mapping_version: string | null;
    quality: number;
    uncertain_fields: string[];
  };
  parser: { name: string; version: string; format: Format; selection_reason: string };
  trace: { raw_event_id: string; ingestion_id: string; raw_sha256: string; source_key: string };
  lineage: Record<string, LineageRecord>;
  enrichment: Record<string, string>;
  extensions: { vendor_specific: Record<string, string> };
}

export interface FieldSuggestion {
  source_field: string;
  sample: string;
  target: string | null;
  confidence: number;
  reason: string;
}

export interface DriftReport {
  id: string;
  source_key: string;
  mapping_id: string;
  from_version: string;
  score: number;
  missing: string[];
  added: string[];
  renames: { from: string; to: string; confidence: number; reason: string }[];
  affected_targets: string[];
  created_at: string;
  event_id: string;
  proposal_id?: string;
}

export interface Proposal {
  id: string;
  kind: "new_source" | "drift";
  source_key: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  decided_at?: string;
  base_mapping?: { mapping_id: string; version: string };
  suggestions: FieldSuggestion[];
  evidence_raw_ids: string[];
  drift_id?: string;
}

export interface Alert {
  id: string;
  key: string;
  rule: string;
  severity: number;
  title: string;
  description: string;
  entities: string[];
  evidence: string[];
  created_at: string;
}

export interface DlqRecord {
  raw_event_id: string;
  stage: string;
  error: string;
  attempts: number;
  at: string;
}

export interface AuditEntry {
  at: string;
  action: string;
  detail: string;
}

export interface UlpfState {
  raws: RawEvent[];
  events: NormalizedEvent[];
  mappings: Mapping[];
  bindings: Record<string, { mapping_id: string; version: string }>;
  proposals: Proposal[];
  drift: DriftReport[];
  alerts: Alert[];
  dlq: DlqRecord[];
  audit: AuditEntry[];
}
