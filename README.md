# PolyFlux — Universal Log Pre-processing Framework

ULPF takes perimeter device logs in many formats (Syslog RFC 3164/5424, JSON, CEF, LEEF, CSV, key=value, vendor formats like Cisco ASA and FortiGate) and turns them into **one Universal Event Schema (UES v1.0)**. The project has a standalone Spring Boot backend, React frontend and PostgreSQL persistence.

```
MANY SOURCES → ONE PROCESSING MODEL → ONE UNIVERSAL EVENT SCHEMA → MANY CONSUMERS
```

## Quick start

```sh
docker compose up --build
# open http://localhost:8080
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
| Ingest | `backend/src/main/java/com/polyflux/ulpf/ingestion/PipelineService.java` | Splits incoming content into records, assigns IDs and hashes, persists raw input and normalized results |
| Detect and parse | `backend/src/main/java/com/polyflux/ulpf/parser/` | Java parser registry for Cisco ASA, FortiGate, CEF, LEEF, JSON, CSV, key=value and syslog |
| Normalize | `backend/src/main/java/com/polyflux/ulpf/normalization/` | Versioned mappings, typed UES fields, lineage, quality, and enrichment |
| Store | `backend/src/main/java/com/polyflux/ulpf/storage/` plus `backend/src/main/resources/db/migration/` | PostgreSQL persistence with Flyway-managed schema |
| HTTP API | `backend/src/main/java/com/polyflux/ulpf/api/` | REST endpoints for ingestion, state, file uploads, mapping proposals, reprocessing, DLQ retry and reset |
| Frontend | `frontend/src/` | Separate React/TanStack browser client calling the Spring Boot API |
| Analytics | `backend/src/main/java/com/polyflux/ulpf/analytics/` and frontend correlation view | Backend rule alerts and frontend correlation graph |

Every event ends in exactly one terminal state: **NORMALIZED**, **PARTIAL**, **RAW_ONLY** or **DEAD_LETTERED** (the DLQ, which you can retry on the Mappings & Ops page).

## Killer features
- **KF1 Self-evolving parser.** Inference uses an alias dictionary plus value-shape matching. A person approves the result, and a new mapping version is saved and bound to the source.
- **KF2 Field-level lineage.** Each UES field records its source field, mapping entry (`id@version#n`), transforms, confidence and raw byte span.
- **KF3 Drift detection.** Compares incoming events with the bound mapping and detects renames by value shape. It never guesses: affected fields are set to null and marked uncertain.
- **KF4 Correlation graph.** Links IPs, devices, users and alerts, with the evidence events for each.

## HTTP API

The backend exposes the ingestion and state APIs on port 8081. The separate frontend runs on port 8080 and reads and writes pipeline data through that backend.

```sh
curl -X POST http://localhost:8081/api/public/v1/events \
  -H 'content-type: application/json' \
  -d '{"text":"<164>Sep 28 10:31:21 ASA01 : %ASA-4-106023: Deny tcp src outside:203.0.113.45/51234 dst inside:10.0.1.20/443 by access-group outside_in"}'

curl http://localhost:8081/api/public/v1/health
```

The frontend is a separate browser client for the Spring Boot API. PostgreSQL stores raw events, normalized events, mappings, proposals, drift reports, alerts, DLQ and audit. Use **Mappings & Ops → Reset** to start fresh, and **Events → Export NDJSON** to send data to a SIEM.

## How this maps to the architecture document

The design document describes a Spring Boot modular monolith with Kafka, OpenSearch, PostgreSQL and Redis. This implementation uses Spring Boot for the backend, PostgreSQL for persisted data and React/TanStack for the separate frontend. OpenSearch and Kafka remain replaceable future adapters.

**Not built yet:** OpenSearch indexing/search, Kafka transport, Redis acceleration, syslog UDP/TCP listeners, rate limiting, authentication/RBAC, and ML anomaly detection.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the layer diagram, API routes, and implementation status against the architecture baseline.

**No performance figures are claimed**, following §16 of the design.

## Tech
Backend: Java 21, Spring Boot, PostgreSQL, Flyway. Frontend: React 19, TanStack Start, Vite, Tailwind CSS v4, shadcn/ui.
