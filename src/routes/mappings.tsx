import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/AppShell";
import { useUlpf } from "@/lib/ulpf/store";

export const Route = createFileRoute("/mappings")({
  head: () => ({
    meta: [
      { title: "Mappings & Operations — ULPF" },
      { name: "description", content: "Versioned declarative mappings, source bindings, dead-letter queue and audit log." },
      { property: "og:title", content: "Mappings & Operations — ULPF" },
      { property: "og:description", content: "The mapping is the central artifact: versioned, declarative, vendor-blind." },
    ],
  }),
  component: MappingsPage,
});

function MappingsPage() {
  const { state, reprocessAll, retryDlq, reset } = useUlpf();
  const mappings = [...state.mappings].sort((a, b) => a.mapping_id.localeCompare(b.mapping_id) || parseFloat(b.version) - parseFloat(a.version));
  return (
    <div>
      <PageHeader kicker="Config · Ops" title="Mappings & operations">
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => toast.success(`Reprocessed ${reprocessAll()} raw events`)}><RefreshCw className="mr-1 h-4 w-4" />Reprocess all from raw</Button>
          <Button variant="ghost" onClick={() => { if (confirm("Clear all events, mappings and proposals?")) reset(); }}><Trash2 className="mr-1 h-4 w-4" />Reset</Button>
        </div>
      </PageHeader>

      <h2 className="mb-2 text-sm font-semibold">Source bindings</h2>
      <div className="mb-8 rounded-md border border-border bg-card p-3 font-mono text-[11px]">
        {Object.entries(state.bindings).map(([k, v]) => <div key={k}><span className="text-muted-foreground">{k}</span> → {v.mapping_id}@{v.version}</div>)}
        {Object.keys(state.bindings).length === 0 && <span className="text-muted-foreground">No generated bindings yet (built-in vendor parsers use their built-in mapping).</span>}
      </div>

      <h2 className="mb-2 text-sm font-semibold">Mappings ({mappings.length})</h2>
      <div className="mb-8 grid gap-3 md:grid-cols-2">
        {mappings.map((m) => (
          <details key={`${m.mapping_id}@${m.version}`} className="rounded-md border border-border bg-card p-3">
            <summary className="cursor-pointer font-mono text-xs">
              <span className="text-primary">{m.mapping_id}</span>@{m.version} <span className="text-muted-foreground">· {m.parser} · {m.entries.length} entries · {m.builtin ? "built-in" : `approved by ${m.approved_by ?? "?"}`}</span>
            </summary>
            <pre className="mt-2 overflow-x-auto font-mono text-[10px] leading-relaxed text-muted-foreground">
{`mapping_id: ${m.mapping_id}
version: "${m.version}"
parser: ${m.parser}
entries:
${m.entries.map((e) => `  - source_field: ${e.source_field}\n    target: ${e.target}\n    type: ${e.type ?? "string"}${e.required ? "\n    required: true" : ""}\n    confidence: ${e.confidence}`).join("\n")}
unmapped_policy: extensions`}
            </pre>
          </details>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Dead-letter queue ({state.dlq.length})</h2>
            {state.dlq.length > 0 && <Button size="sm" variant="outline" onClick={retryDlq}><RotateCcw className="mr-1 h-3.5 w-3.5" />Retry</Button>}
          </div>
          <div className="rounded-md border border-border bg-card p-3 font-mono text-[11px]">
            {state.dlq.map((d) => <div key={d.raw_event_id} className="border-b border-border py-1 last:border-0"><span className="text-destructive">{d.stage}</span> {d.error} <span className="text-muted-foreground">×{d.attempts}</span></div>)}
            {state.dlq.length === 0 && <span className="text-muted-foreground">Empty — RAW_ONLY and PARTIAL are not errors, so the DLQ only signals real faults.</span>}
          </div>
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold">Audit log</h2>
          <div className="max-h-80 overflow-y-auto rounded-md border border-border bg-card p-3 font-mono text-[10px]">
            {state.audit.map((a, i) => <div key={i} className="py-0.5"><span className="text-muted-foreground">{a.at.slice(11, 19)}</span> <span className="text-primary">{a.action}</span> {a.detail}</div>)}
            {state.audit.length === 0 && <span className="text-muted-foreground">No activity yet.</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
