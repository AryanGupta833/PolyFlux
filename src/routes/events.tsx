import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/AppShell";
import { EventSheet, EventTable } from "@/components/ulpf";
import { useUlpf } from "@/lib/ulpf/store";
import type { NormalizedEvent, Status } from "@/lib/ulpf/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/events")({
  head: () => ({
    meta: [
      { title: "Normalized Events — ULPF" },
      { name: "description", content: "Search normalized events, inspect field-level lineage back to the raw bytes, and export NDJSON." },
      { property: "og:title", content: "Normalized Events — ULPF" },
      { property: "og:description", content: "Every event in one universal schema with per-field provenance." },
    ],
  }),
  component: EventsPage,
});

const FILTERS: (Status | "ALL")[] = ["ALL", "NORMALIZED", "PARTIAL", "RAW_ONLY"];

function EventsPage() {
  const { state } = useUlpf();
  const [q, setQ] = useState("");
  const [f, setF] = useState<Status | "ALL">("ALL");
  const [sel, setSel] = useState<NormalizedEvent | null>(null);

  const rawText = useMemo(() => new Map(state.raws.map((r) => [r.raw_event_id, r.raw_text])), [state.raws]);
  const list = useMemo(() => {
    const needle = q.toLowerCase();
    return [...state.events]
      .filter((e) => f === "ALL" || e.normalization.status === f)
      .filter((e) => !needle || JSON.stringify(e).toLowerCase().includes(needle) || (rawText.get(e.trace.raw_event_id) ?? "").toLowerCase().includes(needle))
      .sort((a, b) => b.timestamps.event_time.localeCompare(a.timestamps.event_time))
      .slice(0, 500);
  }, [state.events, q, f, rawText]);

  const exportNdjson = () => {
    const blob = new Blob([list.map((e) => JSON.stringify(e)).join("\n")], { type: "application/x-ndjson" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ulpf-events-${Date.now()}.ndjson`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      <PageHeader kicker="Stage 7 · Store & search" title="Normalized events">
        <Button variant="secondary" onClick={exportNdjson} disabled={!list.length}><Download className="mr-1 h-4 w-4" />Export NDJSON (SIEM)</Button>
      </PageHeader>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input placeholder="Search IP, user, action, raw text…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm font-mono text-xs" />
        {FILTERS.map((x) => (
          <button key={x} onClick={() => setF(x)} className={cn("rounded border px-2.5 py-1 font-mono text-[10px]", f === x ? "border-primary text-primary" : "border-border text-muted-foreground")}>{x}</button>
        ))}
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">{list.length} shown</span>
      </div>
      <EventTable events={list} onSelect={setSel} />
      <EventSheet event={sel} onClose={() => setSel(null)} />
    </div>
  );
}
