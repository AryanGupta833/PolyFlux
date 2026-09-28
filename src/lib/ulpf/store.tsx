import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import * as E from "./engine";
import type { Proposal, UlpfState } from "./types";

const KEY = "ulpf-state-v1";

interface Ctx {
  state: UlpfState;
  ready: boolean;
  ingest: (text: string, opts?: E.IngestOptions) => E.IngestResult;
  approve: (id: string, suggestions?: Proposal["suggestions"]) => void;
  reject: (id: string) => void;
  reprocessAll: () => number;
  retryDlq: () => void;
  reset: () => void;
}

const UlpfCtx = createContext<Ctx | null>(null);

export function UlpfProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UlpfState>(() => E.initialState());
  const [ready, setReady] = useState(false);
  const ref = useRef(state);
  ref.current = state;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) setState({ ...E.initialState(), ...(JSON.parse(saved) as UlpfState) });
    } catch { /* corrupted: start fresh */ }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* quota */ }
    }, 250);
    return () => clearTimeout(t);
  }, [state, ready]);

  const mutate = useCallback(<T,>(fn: (s: UlpfState) => T): T => {
    const draft = structuredClone(ref.current);
    const r = fn(draft);
    ref.current = draft;
    setState(draft);
    return r;
  }, []);

  const value: Ctx = {
    state,
    ready,
    ingest: (text, opts) => mutate((s) => E.ingest(s, text, opts)),
    approve: (id, sug) => { mutate((s) => E.approveProposal(s, id, sug)); },
    reject: (id) => mutate((s) => E.rejectProposal(s, id)),
    reprocessAll: () => mutate((s) => E.reprocess(s)),
    retryDlq: () => mutate((s) => {
      const ids = new Set(s.dlq.map((d) => d.raw_event_id));
      s.raws.filter((r) => ids.has(r.raw_event_id)).forEach((r) => E.processRaw(s, r));
    }),
    reset: () => mutate((s) => Object.assign(s, E.initialState())),
  };
  return <UlpfCtx.Provider value={value}>{children}</UlpfCtx.Provider>;
}

export function useUlpf() {
  const c = useContext(UlpfCtx);
  if (!c) throw new Error("useUlpf must be inside UlpfProvider");
  return c;
}
