CREATE TABLE ulpf_raw_events (
  raw_event_id UUID PRIMARY KEY,
  ingestion_id UUID NOT NULL,
  raw_text TEXT NOT NULL,
  raw_sha256 VARCHAR(64) NOT NULL,
  byte_length INTEGER NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  transport VARCHAR(32) NOT NULL,
  ingestion_context JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_ulpf_raw_ingestion ON ulpf_raw_events(ingestion_id);
CREATE INDEX idx_ulpf_raw_hash ON ulpf_raw_events(raw_sha256);

CREATE TABLE ulpf_events (
  event_id UUID PRIMARY KEY,
  raw_event_id UUID NOT NULL UNIQUE REFERENCES ulpf_raw_events(raw_event_id),
  source_key VARCHAR(512) NOT NULL,
  status VARCHAR(32) NOT NULL,
  event_time TIMESTAMPTZ NOT NULL,
  document JSONB NOT NULL,
  parsed JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ulpf_event_time ON ulpf_events(event_time DESC);
CREATE INDEX idx_ulpf_event_source ON ulpf_events(source_key);
CREATE INDEX idx_ulpf_event_status ON ulpf_events(status);

CREATE TABLE ulpf_mappings (
  mapping_id VARCHAR(160) NOT NULL,
  version VARCHAR(32) NOT NULL,
  parser VARCHAR(160) NOT NULL,
  source_key VARCHAR(512),
  builtin BOOLEAN NOT NULL DEFAULT FALSE,
  document JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (mapping_id, version)
);
CREATE TABLE ulpf_bindings (
  source_key VARCHAR(512) PRIMARY KEY,
  mapping_id VARCHAR(160) NOT NULL,
  version VARCHAR(32) NOT NULL,
  FOREIGN KEY (mapping_id, version) REFERENCES ulpf_mappings(mapping_id, version)
);
CREATE TABLE ulpf_proposals (
  id UUID PRIMARY KEY,
  source_key VARCHAR(512) NOT NULL,
  kind VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  document JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ulpf_proposals_status ON ulpf_proposals(status);
CREATE TABLE ulpf_drift_reports (
  id UUID PRIMARY KEY,
  source_key VARCHAR(512) NOT NULL,
  document JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE ulpf_alerts (
  id UUID PRIMARY KEY,
  alert_key VARCHAR(512) NOT NULL UNIQUE,
  document JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE ulpf_dlq (
  raw_event_id UUID PRIMARY KEY REFERENCES ulpf_raw_events(raw_event_id),
  document JSONB NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE ulpf_audit_log (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  action VARCHAR(160) NOT NULL,
  detail TEXT NOT NULL
);
