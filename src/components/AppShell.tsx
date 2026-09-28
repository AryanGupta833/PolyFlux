import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Activity, GitBranch, Inbox, Layers, Radar, Share2, Waypoints } from "lucide-react";
import { useUlpf } from "@/lib/ulpf/store";

const NAV = [
  { to: "/", label: "Ingest & Overview", icon: Inbox },
  { to: "/events", label: "Events", icon: Activity },
  { to: "/proposals", label: "Proposals", icon: GitBranch },
  { to: "/drift", label: "Schema Drift", icon: Radar },
  { to: "/graph", label: "Correlation", icon: Share2 },
  { to: "/mappings", label: "Mappings & Ops", icon: Layers },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { state } = useUlpf();
  const pending = state.proposals.filter((p) => p.status === "pending").length;
  const drift = state.drift.filter((d) => state.proposals.find((p) => p.id === d.proposal_id)?.status === "pending").length;
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex items-center gap-2 border-b border-sidebar-border px-5 py-5">
          <Waypoints className="h-5 w-5 text-primary" />
          <div>
            <div className="font-mono text-sm font-semibold tracking-widest text-sidebar-foreground">ULPF</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">many sources → one schema</div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-3">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: n.to === "/" }}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-foreground border-l-2 border-primary" }}
            >
              <n.icon className="h-4 w-4" />
              <span className="flex-1">{n.label}</span>
              {n.to === "/proposals" && pending > 0 && <span className="rounded bg-primary px-1.5 font-mono text-[10px] text-primary-foreground">{pending}</span>}
              {n.to === "/drift" && drift > 0 && <span className="rounded bg-destructive px-1.5 font-mono text-[10px] text-destructive-foreground">{drift}</span>}
              {n.to === "/graph" && state.alerts.length > 0 && <span className="rounded bg-destructive/80 px-1.5 font-mono text-[10px] text-destructive-foreground">{state.alerts.length}</span>}
            </Link>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-4 font-mono text-[10px] leading-relaxed text-muted-foreground">
          UES v1.0 · {state.raws.length} raw · {state.events.length} events
          <br />
          raw is sacred · never drop
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <nav className="flex gap-1 overflow-x-auto border-b border-border p-2 md:hidden">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} activeOptions={{ exact: n.to === "/" }} className="whitespace-nowrap rounded px-3 py-1.5 text-xs text-muted-foreground" activeProps={{ className: "bg-accent text-foreground" }}>
              {n.label}
            </Link>
          ))}
        </nav>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, kicker, children }: { title: string; kicker: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">{kicker}</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
      </div>
      {children}
    </div>
  );
}
