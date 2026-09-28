import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { useUlpf } from "@/lib/ulpf/store";

export const Route = createFileRoute("/drift")({
  head: () => ({
    meta: [
      { title: "Schema Drift — ULPF" },
      { name: "description", content: "Detect vendor log format changes, renamed fields and affected schema fields before they silently break parsing." },
      { property: "og:title", content: "Schema Drift — ULPF" },
      { property: "og:description", content: "Drift detection with suggested mapping updates." },
    ],
  }),
  component: DriftPage,
});

function DriftPage() {
  const { state } = useUlpf();
  return (
    <div>
      <PageHeader kicker="KF3 · Drift monitor" title="Schema drift" />
      <p className="mb-6 max-w-3xl text-sm text-muted-foreground">
        Each incoming event is compared with its source's approved mapping. When mapped fields disappear, affected UES fields are set to null and marked uncertain (status PARTIAL) — never guessed. Renames are detected by matching value shapes, and a new mapping version is proposed for approval.
      </p>
      <div className="space-y-4">
        {state.drift.map((d) => {
          const p = state.proposals.find((x) => x.id === d.proposal_id);
          return (
            <div key={d.id} className="rounded-md border border-warning/40 bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <span className="font-mono text-sm">{d.source_key}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{d.mapping_id}@{d.from_version}</span>
                </div>
                <div className="font-mono text-xs">drift score <span className="text-warning">{d.score}</span></div>
              </div>
              <div className="mt-3 grid gap-3 font-mono text-[11px] md:grid-cols-3">
                <div><div className="mb-1 text-[10px] uppercase text-muted-foreground">Missing</div>{d.missing.join(", ") || "—"}</div>
                <div><div className="mb-1 text-[10px] uppercase text-muted-foreground">New fields</div>{d.added.join(", ") || "—"}</div>
                <div><div className="mb-1 text-[10px] uppercase text-muted-foreground">Uncertain UES fields</div><span className="text-warning">{d.affected_targets.join(", ")}</span></div>
              </div>
              {d.renames.length > 0 && (
                <div className="mt-3 space-y-1">
                  {d.renames.map((r) => (
                    <div key={r.from} className="font-mono text-[11px]"><span className="text-muted-foreground">{r.from}</span> → <span className="text-primary">{r.to}</span> <span className="text-muted-foreground">({r.confidence} · {r.reason})</span></div>
                  ))}
                </div>
              )}
              <div className="mt-3 text-xs">
                Suggested update: <Link to="/proposals" className="text-primary hover:underline">{p?.status === "pending" ? "review proposal →" : `proposal ${p?.status ?? "n/a"}`}</Link>
              </div>
            </div>
          );
        })}
        {state.drift.length === 0 && <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No drift detected. Run scenario 2, approve it, then run scenario 4.</div>}
      </div>
    </div>
  );
}
