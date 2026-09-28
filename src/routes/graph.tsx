import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { EventSheet } from "@/components/ulpf";
import { buildGraph, type GraphNode } from "@/lib/ulpf/engine";
import { useUlpf } from "@/lib/ulpf/store";
import type { NormalizedEvent } from "@/lib/ulpf/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/graph")({
  head: () => ({
    meta: [
      { title: "Correlation Graph & Alerts — ULPF" },
      { name: "description", content: "Attack correlation graph linking IPs, devices, users and alerts, with evidence events for every node." },
      { property: "og:title", content: "Correlation Graph & Alerts — ULPF" },
      { property: "og:description", content: "See a port scan, brute force and compromise as one connected story." },
    ],
  }),
  component: GraphPage,
});

const W = 900, H = 560;
const COLOR: Record<GraphNode["type"], string> = { ip: "var(--color-info)", device: "var(--color-success)", user: "var(--color-primary)", alert: "var(--color-destructive)" };

function layout(nodes: GraphNode[], edges: { from: string; to: string }[]) {
  const pos = new Map<string, { x: number; y: number }>();
  nodes.forEach((n, i) => {
    const a = (i / Math.max(1, nodes.length)) * Math.PI * 2;
    pos.set(n.id, { x: W / 2 + Math.cos(a) * 220, y: H / 2 + Math.sin(a) * 200 });
  });
  for (let it = 0; it < 250; it++) {
    const f = new Map<string, { x: number; y: number }>(nodes.map((n) => [n.id, { x: 0, y: 0 }]));
    for (const a of nodes) for (const b of nodes) {
      if (a === b) continue;
      const pa = pos.get(a.id)!, pb = pos.get(b.id)!;
      const dx = pa.x - pb.x, dy = pa.y - pb.y;
      const d2 = Math.max(100, dx * dx + dy * dy);
      const fa = f.get(a.id)!;
      fa.x += (dx / d2) * 3000; fa.y += (dy / d2) * 3000;
    }
    for (const e of edges) {
      const pa = pos.get(e.from), pb = pos.get(e.to);
      if (!pa || !pb) continue;
      const dx = pb.x - pa.x, dy = pb.y - pa.y;
      const fa = f.get(e.from)!, fb = f.get(e.to)!;
      fa.x += dx * 0.02; fa.y += dy * 0.02; fb.x -= dx * 0.02; fb.y -= dy * 0.02;
    }
    for (const n of nodes) {
      const p = pos.get(n.id)!, fo = f.get(n.id)!;
      p.x = Math.min(W - 40, Math.max(40, p.x + fo.x + (W / 2 - p.x) * 0.01));
      p.y = Math.min(H - 30, Math.max(30, p.y + fo.y + (H / 2 - p.y) * 0.01));
    }
  }
  return pos;
}

function GraphPage() {
  const { state } = useUlpf();
  const [focus, setFocus] = useState<string | undefined>();
  const [selNode, setSelNode] = useState<GraphNode | null>(null);
  const [ev, setEv] = useState<NormalizedEvent | null>(null);
  const g = useMemo(() => buildGraph(state, focus), [state, focus]);
  const pos = useMemo(() => layout(g.nodes, g.edges), [g]);
  const byId = useMemo(() => new Map(state.events.map((e) => [e.event_id, e])), [state.events]);

  return (
    <div>
      <PageHeader kicker="KF4 · Correlation" title="Attack correlation graph">
        {focus && <button onClick={() => setFocus(undefined)} className="rounded border border-border px-3 py-1.5 text-xs">Clear focus ({focus})</button>}
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="rounded-md border border-border bg-card p-2">
          <div className="flex gap-4 px-2 py-1 text-[11px] text-muted-foreground">
            {(Object.keys(COLOR) as GraphNode["type"][]).map((t) => <span key={t} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR[t] }} />{t}</span>)}
            <span className="ml-auto">click a node for evidence · double-click to focus</span>
          </div>
          {g.nodes.length === 0 ? (
            <div className="grid h-96 place-items-center text-sm text-muted-foreground">Run demo scenario 5 to build the graph.</div>
          ) : (
            <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
              {g.edges.map((e, i) => {
                const a = pos.get(e.from), b = pos.get(e.to);
                if (!a || !b) return null;
                const hostile = e.kind === "deny" || e.kind === "login_failure" || e.kind === "implicates";
                return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={hostile ? "var(--color-destructive)" : "var(--color-border)"} strokeOpacity={hostile ? 0.55 : 1} strokeWidth={Math.min(4, 1 + e.events.length * 0.4)} strokeDasharray={e.kind === "implicates" ? "4 3" : undefined} />;
              })}
              {g.nodes.map((n) => {
                const p = pos.get(n.id)!;
                const r = n.type === "alert" ? 9 : Math.min(16, 6 + n.events.length);
                return (
                  <g key={n.id} transform={`translate(${p.x},${p.y})`} className="cursor-pointer" onClick={() => setSelNode(n)} onDoubleClick={() => setFocus(n.id)}>
                    {n.type === "alert" ? <rect x={-r} y={-r} width={r * 2} height={r * 2} transform="rotate(45)" fill={COLOR[n.type]} /> : <circle r={r} fill={COLOR[n.type]} fillOpacity={0.9} stroke={selNode?.id === n.id ? "var(--color-foreground)" : "none"} strokeWidth={2} />}
                    <text y={r + 12} textAnchor="middle" fontSize={10} fill="var(--color-foreground)" fontFamily="JetBrains Mono, monospace">{n.label}</text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>
        <div className="space-y-4">
          {selNode && (
            <div className="rounded-md border border-primary/50 bg-card p-3">
              <div className="font-mono text-[10px] uppercase text-primary">{selNode.type}</div>
              <div className="font-mono text-sm">{selNode.label}</div>
              <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                {selNode.events.map((id) => byId.get(id)).filter(Boolean).map((e) => (
                  <button key={e!.event_id} onClick={() => setEv(e!)} className="block w-full rounded px-2 py-1 text-left font-mono text-[10px] hover:bg-accent">
                    {e!.timestamps.event_time.slice(11, 19)} {e!.event.action} {e!.network.source_ip ?? ""} → {e!.network.destination_ip ?? ""}{e!.network.destination_port !== null ? `:${e!.network.destination_port}` : ""}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <h2 className="mb-2 text-sm font-semibold">Alerts ({state.alerts.length})</h2>
            <div className="space-y-2">
              {state.alerts.map((a) => (
                <button key={a.id} onClick={() => { setSelNode({ id: `alert:${a.id}`, type: "alert", label: a.rule, events: a.evidence }); }} className={cn("block w-full rounded-md border bg-card p-3 text-left", a.severity >= 9 ? "border-destructive/60" : "border-warning/50")}>
                  <div className="flex justify-between font-mono text-[10px]"><span className={a.severity >= 9 ? "text-destructive" : "text-warning"}>{a.rule}</span><span className="text-muted-foreground">sev {a.severity}</span></div>
                  <div className="mt-1 text-sm">{a.title}</div>
                  <div className="text-xs text-muted-foreground">{a.description} · {a.evidence.length} evidence</div>
                </button>
              ))}
              {state.alerts.length === 0 && <p className="text-xs text-muted-foreground">No alerts yet.</p>}
            </div>
          </div>
        </div>
      </div>
      <EventSheet event={ev} onClose={() => setEv(null)} />
    </div>
  );
}
