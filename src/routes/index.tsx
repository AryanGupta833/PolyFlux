import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Play, Upload, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/AppShell";
import { EventSheet, EventTable, Stat } from "@/components/ulpf";
import { useUlpf } from "@/lib/ulpf/store";
import { SAMPLES, SCENARIOS } from "@/lib/ulpf/samples";
import type { NormalizedEvent } from "@/lib/ulpf/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ingest & Overview — PolyFlux" },
      { name: "description", content: "Send syslog, JSON, CEF, LEEF, CSV or key-value logs and watch them normalize into the Universal Event Schema." },
      { property: "og:title", content: "Ingest & Overview — PolyFlux" },
      { property: "og:description", content: "Universal Log Pre-processing Framework: many sources, one processing model, one schema." },
    ],
  }),
  component: Overview,
});

function Overview() {
  const { state, ingest } = useUlpf();
  const [text, setText] = useState(SAMPLES[0]?.text ?? "");
  const [sel, setSel] = useState<NormalizedEvent | null>(null);

  const counts = useMemo(() => {
    const c = { NORMALIZED: 0, PARTIAL: 0, RAW_ONLY: 0 };
    state.events.forEach((e) => c[e.normalization.status]++);
    return c;
  }, [state.events]);
  const recent = useMemo(() => [...state.events].sort((a, b) => b.timestamps.ingest_time.localeCompare(a.timestamps.ingest_time) || b.trace.raw_event_id.localeCompare(a.trace.raw_event_id)).slice(0, 12), [state.events]);

  const send = (payload: string, file?: string) => {
    const r = ingest(payload, file ? { transport: "file", file } : { transport: "http" });
    const raw = r.events.filter((e) => e.normalization.status === "RAW_ONLY").length;
    toast.success(`Ingested ${r.accepted} event${r.accepted === 1 ? "" : "s"}${r.rejected ? `, ${r.rejected} rejected (size cap)` : ""}`, {
      description: raw ? `${raw} unknown — a mapping proposal is waiting on the Proposals page.` : undefined,
    });
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast.error("File larger than 5 MB demo limit"); return; }
    send(await f.text(), f.name);
  };

  return (
    <div>
      <PageHeader kicker="Stage 1 · Ingestion" title="Many sources → one schema" />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Raw preserved" value={state.raws.length} />
        <Stat label="Normalized" value={counts.NORMALIZED} tone="success" />
        <Stat label="Partial" value={counts.PARTIAL} tone="warning" />
        <Stat label="Raw only" value={counts.RAW_ONLY} tone="info" />
        <Stat label="Dead-lettered" value={state.dlq.length} tone="destructive" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-md border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Ingest console</h2>
            <span className="font-mono text-[10px] text-muted-foreground">one event per line · JSON array · NDJSON · CSV with header</span>
          </div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {SAMPLES.map((s) => (
              <button key={s.label} onClick={() => setText(s.text)} className="rounded border border-border px-2 py-1 font-mono text-[10px] text-muted-foreground hover:border-primary hover:text-foreground">
                {s.label}
              </button>
            ))}
          </div>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} className="font-mono text-xs" spellCheck={false} />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => send(text)} disabled={!text.trim()}><Send className="mr-1 h-4 w-4" />Send to pipeline</Button>
            <Button variant="secondary" asChild>
              <label className="cursor-pointer"><Upload className="mr-1 h-4 w-4" />Upload .log / .json / .csv
                <input type="file" accept=".log,.txt,.json,.csv,.ndjson" className="hidden" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
            </Button>
          </div>
        </section>

        <section className="rounded-md border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Demo scenarios</h2>
          <ol className="space-y-2">
            {SCENARIOS.map((s) => (
              <li key={s.id} className="flex items-start gap-3 rounded border border-border p-2.5">
                <span className="font-mono text-xs text-primary">0{s.id}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{s.title}</div>
                  <div className="text-xs text-muted-foreground">{s.description}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => send(s.text)} aria-label={`Run scenario ${s.id}`}><Play className="h-3.5 w-3.5" /></Button>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <div className="mt-8 mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Latest events</h2>
        <Link to="/events" className="text-xs text-primary hover:underline">All events →</Link>
      </div>
      <EventTable events={recent} onSelect={setSel} />
      <EventSheet event={sel} onClose={() => setSel(null)} />
    </div>
  );
}
