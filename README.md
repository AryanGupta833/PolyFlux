# PolyFlux — Universal Log Pre-processing Framework

ULPF takes perimeter device logs in many formats (Syslog RFC 3164/5424, JSON, CEF, LEEF, CSV, key=value, vendor formats like Cisco ASA and FortiGate) and turns them into **one Universal Event Schema (UES v1.0)**.

```
MANY SOURCES → ONE PROCESSING MODEL → ONE UNIVERSAL EVENT SCHEMA → MANY CONSUMERS
```

## Quick start

```sh
bun install
bun run dev        # open http://localhost:8080
```

Go to **Ingest & Overview** and click the ▶ buttons for the demo scenarios, in order 1 → 5.

## Demo script (for the judges)

| # | What to do | What you'll see |
|---|---|---|
| 1 | Run "Known source" | Cisco ASA log detected as syslog, parsed by `cisco-asa-parser`, status **NORMALIZED** |
| 2 | Run "Unknown source", then open **Proposals** | Status **RAW_ONLY** plus an inferred mapping. Edit the targets if needed, then click **Approve & reprocess**. Earlier events are re-normalized from raw |
| 3 | Run "Lineage", open the event, click `network.source_ip` | Source field → parser → mapping entry → transforms → confidence, with the raw bytes highlighted |
| 4 | Run "Schema drift" (after step 2) | **Drift** page shows renames (`SRC→source`, `DST→destination`, `ACT→decision`), the fields marked uncertain, status PARTIAL, and a suggested mapping v2.0 to approve |
| 5 | Run "Attack chain", open **Correlation** | Alerts for PORT_SCAN → BRUTE_FORCE → LOGIN_AFTER_BRUTE_FORCE → SUSPICIOUS_OUTBOUND, plus a graph of IPs, devices, users and alerts. Click a node to see the events behind it |

## Pipeline

| Stage | Where in the code | Notes |
|---|---|---|
| Ingest | `src/lib/ulpf/engine.ts` `ingest`, `makeRaw` | Splits JSON arrays, NDJSON, CSV (with header) and lines. Assigns UUIDv7 `raw_event_id` and SHA-256 of the exact text. Caps each event at 64 KB |
| Detect | `parsers.ts` `detectFormats` | Uses the log's signature and structure, never the filename. Returns a ranked list with confidence |
| Parser registry | `parsers.ts` `selectAndParse` | Every parser returns a score. The top score wins, and the reason and alternatives are recorded |
| Parse | `parsers.ts` | Cisco ASA, FortiGate, CEF, LEEF, generic JSON / CSV / KV / Syslog / raw. The key=value tokenizer is linear, with no backtracking regex |
| Normalize | `normalize.ts` `normalize` | Declarative, versioned mappings. Converts types (ip, port, protocol, enum, severity, timestamp) and applies named transforms. Writes lineage for each field. Unmapped fields go to `extensions` and are never dropped |
| Validate / enrich | `normalize.ts` | Required-field policy, quality score, private/public IP classification, port → service name, traffic direction |
| Store | `store.tsx` | Idempotent upsert keyed by the deterministic `event_id = uuid(sha256("ulpf:event:"+raw_event_id))` |
| Analytics | `engine.ts` `runAnalytics`, `buildGraph` | Rule alerts and the correlation graph |

Every event ends in exactly one terminal state: **NORMALIZED**, **PARTIAL**, **RAW_ONLY** or **DEAD_LETTERED** (the DLQ, which you can retry on the Mappings & Ops page).

## Killer features
- **KF1 Self-evolving parser.** Inference uses an alias dictionary plus value-shape matching. A person approves the result, and a new mapping version is saved and bound to the source.
- **KF2 Field-level lineage.** Each UES field records its source field, mapping entry (`id@version#n`), transforms, confidence and raw byte span.
- **KF3 Drift detection.** Compares incoming events with the bound mapping and detects renames by value shape. It never guesses: affected fields are set to null and marked uncertain.
- **KF4 Correlation graph.** Links IPs, devices, users and alerts, with the evidence events for each.

## HTTP API

The API is stateless: it runs the full pipeline and returns UES JSON.

```sh
curl -X POST http://localhost:8080/api/public/v1/events \
  -H 'content-type: text/plain' \
  --data-binary '<164>Sep 28 10:31:21 ASA01 : %ASA-4-106023: Deny tcp src outside:203.0.113.45/51234 dst inside:10.0.1.20/443 by access-group "outside_in"'

curl http://localhost:8080/api/public/v1/health
```

The dashboard keeps its state (raw events, events, mappings, proposals, drift reports, alerts, audit log) in browser local storage. Use **Mappings & Ops → Reset** to start fresh, and **Events → Export NDJSON** to send data to a SIEM.

## How this maps to the architecture document

The design document describes a production deployment: a Spring Boot modular monolith with Kafka, OpenSearch, PostgreSQL and Redis. This MVP implements the same processing model, schema and four killer features in TypeScript (TanStack Start + React).
- The in-process direct queue stands in for Kafka.
- Browser storage stands in for OpenSearch and PostgreSQL.
- The engine is written as pure functions over a state object, so each storage backend can be replaced behind the same interfaces.

**Not built yet:** syslog UDP/TCP listeners, rate limiting, ML anomaly detection, and server-side persistent storage.

**No performance figures are claimed**, following §16 of the design.

## Tech
TanStack Start (React 19, Vite), Tailwind CSS v4, shadcn/ui. The engine has no dependencies and runs in both the browser and edge workers.
