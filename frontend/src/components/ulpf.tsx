import { useState } from "react";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { verifyRaw } from "@/lib/ulpf/engine";
import { useUlpf } from "@/lib/ulpf/store";
import { formatEventTime } from "@/lib/ulpf/time";
import type { NormalizedEvent, Status } from "@/lib/ulpf/types";
import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: Status | "DEAD_LETTERED" }) {
  const cls =
    status === "NORMALIZED" ? "border-success/40 bg-success/10 text-success"
      : status === "PARTIAL" ? "border-warning/40 bg-warning/10 text-warning"
        : status === "RAW_ONLY" ? "border-info/40 bg-info/10 text-info"
          : "border-destructive/40 bg-destructive/10 text-destructive";
  return <span className={cn("inline-flex rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide", cls)}>{status}</span>;
}

export function SeverityDot({ sev }: { sev: number | null }) {
  const cls = sev === null ? "bg-muted-foreground/40" : sev >= 8 ? "bg-destructive" : sev >= 5 ? "bg-warning" : "bg-success";
  return <span className={cn("inline-block h-2 w-2 rounded-full", cls)} title={sev === null ? "n/a" : `severity ${sev}`} />;
}

export function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "success" | "warning" | "info" | "destructive" }) {
  const t = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : tone === "info" ? "text-info" : tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-mono text-2xl font-semibold", t)}>{value}</div>
    </div>
  );
}

function RawWithSpan({ text, span }: { text: string; span?: [number, number] | undefined }) {
  if (!span) return <>{text}</>;
  return (
    <>
      {text.slice(0, span[0])}
      <mark className="rounded-sm bg-primary px-0.5 text-primary-foreground">{text.slice(span[0], span[1])}</mark>
      {text.slice(span[1])}
    </>
  );
}

const SHOW_FIELDS = [
  "timestamps.event_time", "timestamps.ingest_time", "source.device_id", "source.vendor", "event.category", "event.type", "event.action", "event.outcome", "event.severity",
  "network.source_ip", "network.source_port", "network.destination_ip", "network.destination_port", "network.protocol", "network.direction",
  "identity.username", "rule.id", "rule.name",
];

function get(ev: NormalizedEvent, path: string): unknown {
  return path.split(".").reduce<unknown>((o, p) => (o as Record<string, unknown> | null)?.[p], ev);
}

export function EventSheet({ event, onClose }: { event: NormalizedEvent | null; onClose: () => void }) {
  const { state } = useUlpf();
  const [field, setField] = useState<string | null>(null);
  const [tab, setTab] = useState<"fields" | "json">("fields");
  const raw = event ? state.raws.find((r) => r.raw_event_id === event.trace.raw_event_id) : undefined;
  const lin = event && field ? event.lineage[field] : undefined;
  const integrity = raw ? verifyRaw(raw) : false;

  return (
    <Sheet open={!!event} onOpenChange={(o) => { if (!o) { onClose(); setField(null); } }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        {event && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 font-mono text-sm">
                <StatusBadge status={event.normalization.status} /> {event.event_id}
              </SheetTitle>
            </SheetHeader>
            <div className="space-y-5 px-4 pb-8">
              <section>
                <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
                  <span>Raw event (append-only)</span>
                  <span className={cn("flex items-center gap-1 normal-case", integrity ? "text-success" : "text-destructive")}>
                    {integrity ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
                    raw_integrity: {integrity ? "verified" : "FAILED"}
                  </span>
                </div>
                <pre className="whitespace-pre-wrap break-all rounded-md border border-border bg-background p-3 font-mono text-xs leading-relaxed">
                  <RawWithSpan text={raw?.raw_text ?? "(raw evicted)"} span={lin?.raw_span} />
                </pre>
                <div className="mt-1 font-mono text-[10px] text-muted-foreground">sha256 {event.trace.raw_sha256.slice(0, 24)}… · {raw?.byte_length ?? 0} bytes · {raw?.transport}</div>
              </section>

              <section className="rounded-md border border-border bg-card p-3 text-xs">
                <div className="mb-3 grid gap-2 border-b border-border pb-3 sm:grid-cols-2">
                  <div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Log timestamp{event.timestamps.event_time_inferred ? " · inferred from receipt" : ""}</div><time title={event.timestamps.event_time} className="font-mono">{formatEventTime(event.timestamps.event_time)}</time></div>
                  <div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Received by application</div><time title={event.timestamps.ingest_time} className="font-mono">{formatEventTime(event.timestamps.ingest_time)}</time></div>
                </div>
                <div className="grid grid-cols-2 gap-2 font-mono">
                  <div><span className="text-muted-foreground">parser </span>{event.parser.name}@{event.parser.version}</div>
                  <div><span className="text-muted-foreground">mapping </span>{event.normalization.mapping_id ?? "—"}{event.normalization.mapping_version ? `@${event.normalization.mapping_version}` : ""}</div>
                  <div><span className="text-muted-foreground">format </span>{event.parser.format}</div>
                  <div><span className="text-muted-foreground">quality </span>{event.normalization.quality}</div>
                </div>
                <div className="mt-2 text-muted-foreground">{event.parser.selection_reason}</div>
                {event.normalization.uncertain_fields.length > 0 && (
                  <div className="mt-2 text-warning">uncertain: {event.normalization.uncertain_fields.join(", ")}</div>
                )}
              </section>

              <div className="flex gap-1 border-b border-border">
                {(["fields", "json"] as const).map((t) => (
                  <button key={t} onClick={() => setTab(t)} className={cn("px-3 py-1.5 text-xs", tab === t ? "border-b-2 border-primary text-foreground" : "text-muted-foreground")}>
                    {t === "fields" ? "Fields & lineage" : "UES JSON"}
                  </button>
                ))}
              </div>

              {tab === "fields" ? (
                <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
                  <div className="divide-y divide-border rounded-md border border-border">
                    {SHOW_FIELDS.map((f) => {
                      const v = get(event, f);
                      const has = !!event.lineage[f];
                      return (
                        <button key={f} disabled={!has} onClick={() => setField(f)}
                          className={cn("flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left font-mono text-[11px]", has && "hover:bg-accent", field === f && "bg-accent", event.normalization.uncertain_fields.includes(f) && "text-warning")}>
                          <span className="text-muted-foreground">{f}</span>
                          <span className={cn("truncate", has ? "text-foreground underline decoration-primary/50 underline-offset-2" : "")}>{v === null || v === undefined ? "null" : String(v)}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div>
                    {lin && field ? (
                      <div className="space-y-2 rounded-md border border-primary/40 bg-card p-3 font-mono text-[11px]">
                        <div className="text-[10px] uppercase tracking-wider text-primary">Lineage · {field}</div>
                        {[
                          ["value", String(get(event, field))],
                          ["raw value", lin.raw_value],
                          ["source field", lin.source_field],
                          ["parser", `${event.parser.name}@${event.parser.version}`],
                          ["mapping entry", lin.mapping],
                          ["transforms", lin.transforms.join(" → ") || "none"],
                          ["confidence", String(lin.confidence)],
                          ["raw span", lin.raw_span ? `[${lin.raw_span[0]}, ${lin.raw_span[1]}]` : "n/a"],
                          ["raw_event_id", event.trace.raw_event_id],
                        ].map(([k, v]) => (
                          <div key={k} className="flex justify-between gap-3"><span className="text-muted-foreground">{k}</span><span className="break-all text-right">{v}</span></div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Click an underlined field to trace it back to the raw bytes: source field → parser → mapping entry → highlighted span.</p>
                    )}
                    {Object.keys(event.extensions.vendor_specific).length > 0 && (
                      <div className="mt-4">
                        <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">Extensions (never dropped)</div>
                        <div className="rounded-md border border-border p-2 font-mono text-[10px]">
                          {Object.entries(event.extensions.vendor_specific).map(([k, v]) => (
                            <div key={k} className="flex justify-between gap-2"><span className="text-muted-foreground">{k}</span><span className="truncate">{v}</span></div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <pre className="overflow-x-auto rounded-md border border-border bg-background p-3 font-mono text-[10px] leading-relaxed">{JSON.stringify(event, null, 2)}</pre>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function EventRow({ e, onClick }: { e: NormalizedEvent; onClick: () => void }) {
  const n = e.network;
  return (
    <tr onClick={onClick} className="cursor-pointer border-b border-border font-mono text-[11px] hover:bg-accent/60">
      <td className="px-3 py-2"><SeverityDot sev={e.event.severity} /></td>
      <td suppressHydrationWarning title={e.timestamps.event_time} className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatEventTime(e.timestamps.event_time)}</td>
      <td suppressHydrationWarning title={e.timestamps.ingest_time} className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatEventTime(e.timestamps.ingest_time)}</td>
      <td className="px-3 py-2"><StatusBadge status={e.normalization.status} /></td>
      <td className="px-3 py-2">{e.source.device_id ?? "—"}</td>
      <td className="px-3 py-2">{e.event.action ?? "—"}</td>
      <td className="whitespace-nowrap px-3 py-2">{n.source_ip ? `${n.source_ip}${n.source_port !== null ? `:${n.source_port}` : ""}` : "—"}</td>
      <td className="whitespace-nowrap px-3 py-2">{n.destination_ip ? `${n.destination_ip}${n.destination_port !== null ? `:${n.destination_port}` : ""}` : "—"}</td>
      <td className="px-3 py-2 text-muted-foreground">{e.parser.name}</td>
    </tr>
  );
}

export function EventTable({ events, onSelect }: { events: NormalizedEvent[]; onSelect: (e: NormalizedEvent) => void }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-card">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2" /><th className="px-3 py-2">Log timestamp</th><th className="px-3 py-2">Received by app</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Device</th><th className="px-3 py-2">Action</th><th className="px-3 py-2">Source</th><th className="px-3 py-2">Destination</th><th className="px-3 py-2">Parser</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => <EventRow key={e.event_id} e={e} onClick={() => onSelect(e)} />)}
          {events.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-sm text-muted-foreground">No events yet — ingest some logs.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
