import { createFileRoute } from "@tanstack/react-router";
import { ingest, initialState } from "@/lib/ulpf/engine";

// Stateless HTTP ingestion: runs the full pipeline and returns UES documents.
// Accepts text/plain (one event per line), NDJSON, a JSON array, a single JSON object, or CSV with header.
const MAX_BODY = 2 * 1024 * 1024;

export const Route = createFileRoute("/api/public/v1/events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        if (!body.trim()) return Response.json({ error: "empty body" }, { status: 400 });
        if (body.length > MAX_BODY) return Response.json({ error: "payload too large (2 MB max)" }, { status: 413 });
        const s = initialState();
        const r = ingest(s, body, { transport: "http" });
        return Response.json({
          ingestion_id: r.ingestion_id,
          accepted: r.accepted,
          rejected: r.rejected,
          events: r.events,
          proposals: s.proposals,
          alerts: s.alerts,
          dead_letter: s.dlq,
        });
      },
    },
  },
});
