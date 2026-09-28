import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/AppShell";
import { useUlpf } from "@/lib/ulpf/store";
import type { FieldSuggestion, Proposal } from "@/lib/ulpf/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/proposals")({
  head: () => ({
    meta: [
      { title: "Mapping Proposals — ULPF" },
      { name: "description", content: "Human-in-the-loop self-evolving parser: review inferred mappings for unknown log sources and approve them." },
      { property: "og:title", content: "Mapping Proposals — ULPF" },
      { property: "og:description", content: "Onboard a new log source with zero code: approve an inferred mapping." },
    ],
  }),
  component: ProposalsPage,
});

const TARGETS = [
  "network.source_ip", "network.destination_ip", "network.source_port", "network.destination_port", "network.protocol", "network.direction",
  "event.action", "event.severity", "event.type", "identity.username", "rule.id", "rule.name", "timestamps.event_time", "source.device_id",
  "extensions.vendor_specific.destination_host",
];

function ProposalCard({ p }: { p: Proposal }) {
  const { state, approve, reject } = useUlpf();
  const [sug, setSug] = useState<FieldSuggestion[]>(p.suggestions);
  const raw = state.raws.find((r) => r.raw_event_id === p.evidence_raw_ids[0]);
  const drift = p.drift_id ? state.drift.find((d) => d.id === p.drift_id) : undefined;
  const pending = p.status === "pending";

  return (
    <div className={cn("rounded-md border bg-card", pending ? "border-primary/50" : "border-border opacity-70")}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-primary">{p.kind === "drift" ? `Drift fix · ${p.base_mapping?.mapping_id}@${p.base_mapping?.version} → v${Math.floor(parseFloat(p.base_mapping?.version ?? "1")) + 1}.0` : "New source · generated parser"}</div>
          <div className="font-mono text-sm">{p.source_key}</div>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
          {p.evidence_raw_ids.length} evidence event{p.evidence_raw_ids.length === 1 ? "" : "s"} · <span className={cn(p.status === "approved" && "text-success", p.status === "rejected" && "text-destructive", pending && "text-primary")}>{p.status}</span>
        </div>
      </div>
      {raw && <pre className="whitespace-pre-wrap break-all border-b border-border bg-background px-4 py-2 font-mono text-[11px] text-muted-foreground">{raw.raw_text}</pre>}
      {drift && (
        <div className="border-b border-border px-4 py-2 text-xs text-warning">
          Drift score {drift.score} · renames: {drift.renames.map((r) => `${r.from} → ${r.to}`).join(", ") || "none"} · missing: {drift.missing.join(", ")}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full font-mono text-[11px]">
          <thead><tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground"><th className="px-4 py-2">Source field</th><th className="px-4 py-2">Sample</th><th className="px-4 py-2">Target (UES)</th><th className="px-4 py-2">Conf.</th><th className="px-4 py-2">Why</th></tr></thead>
          <tbody>
            {sug.map((s, i) => (
              <tr key={`${s.source_field}-${i}`} className="border-t border-border">
                <td className="px-4 py-1.5">{s.source_field}</td>
                <td className="max-w-40 truncate px-4 py-1.5 text-muted-foreground">{s.sample || "—"}</td>
                <td className="px-4 py-1.5">
                  <select disabled={!pending} value={s.target ?? ""} onChange={(e) => setSug(sug.map((x, j) => (j === i ? { ...x, target: e.target.value || null, confidence: e.target.value ? Math.max(x.confidence, 0.9) : 0, reason: e.target.value ? "set by analyst" : "kept in extensions" } : x)))}
                    className="rounded border border-input bg-background px-1.5 py-1 text-[11px]">
                    <option value="">→ extensions (keep)</option>
                    {TARGETS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </td>
                <td className={cn("px-4 py-1.5", s.confidence >= 0.8 ? "text-success" : s.confidence >= 0.5 ? "text-warning" : "text-muted-foreground")}>{s.confidence ? s.confidence.toFixed(2) : "—"}</td>
                <td className="px-4 py-1.5 font-sans text-[11px] text-muted-foreground">{s.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pending && (
        <div className="flex gap-2 border-t border-border px-4 py-3">
          <Button size="sm" onClick={() => { approve(p.id, sug); toast.success("Mapping approved", { description: "Earlier events from this source were reprocessed from raw." }); }}><Check className="mr-1 h-4 w-4" />Approve & reprocess</Button>
          <Button size="sm" variant="ghost" onClick={() => reject(p.id)}><X className="mr-1 h-4 w-4" />Reject</Button>
        </div>
      )}
    </div>
  );
}

function ProposalsPage() {
  const { state } = useUlpf();
  const pending = state.proposals.filter((p) => p.status === "pending");
  const done = state.proposals.filter((p) => p.status !== "pending");
  return (
    <div>
      <PageHeader kicker="KF1 · Self-evolving parser" title="Mapping proposals" />
      <p className="mb-6 max-w-3xl text-sm text-muted-foreground">
        Unknown sources are never dropped: they are stored as RAW_ONLY and the inference engine proposes a mapping from field names (alias dictionary) and value shapes. An analyst edits and approves it — no code — and every earlier event from that source is re-normalized from its preserved raw bytes.
      </p>
      <div className="space-y-4">
        {pending.map((p) => <ProposalCard key={p.id} p={p} />)}
        {pending.length === 0 && <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No pending proposals. Run demo scenario 2 on the Ingest page.</div>}
      </div>
      {done.length > 0 && (
        <>
          <h2 className="mt-10 mb-3 text-sm font-semibold text-muted-foreground">History</h2>
          <div className="space-y-4">{done.map((p) => <ProposalCard key={p.id} p={p} />)}</div>
        </>
      )}
    </div>
  );
}
