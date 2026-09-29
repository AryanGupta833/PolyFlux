import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import * as E from "./engine";
import { ulpfApi } from "./api";
import type { Proposal, UlpfState } from "./types";

interface Ctx {
  state: UlpfState;
  ready: boolean;
  ingest: (text: string, opts?: E.IngestOptions) => Promise<E.IngestResult>;
  ingestFile: (file: File) => Promise<{ accepted: number; rejected: number; events: UlpfState["events"] }>;
  approve: (id: string, suggestions?: Proposal["suggestions"]) => Promise<void>;
  reject: (id: string) => Promise<void>;
  reprocessAll: () => Promise<number>;
  retryDlq: () => Promise<void>;
  reset: () => Promise<void>;
}

const UlpfCtx = createContext<Ctx | null>(null);

export function UlpfProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UlpfState>(() => E.initialState());
  const [ready, setReady] = useState(false);
  const ref = useRef(state);
  ref.current = state;

  const refresh = useCallback(async () => {
    const next = await ulpfApi.state();
    ref.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const next = await ulpfApi.state();
        if (active) { ref.current = next; setState(next); }
      } catch (error) {
        if (active) toast.error("Backend unavailable", { description: error instanceof Error ? error.message : "Could not load server state." });
      } finally { if (active) setReady(true); }
    };
    void load();
    const timer = window.setInterval(() => { if (active) void refresh().catch(() => undefined); }, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [refresh]);

  const act = useCallback(async <T,>(operation: () => Promise<T>) => {
    const result = await operation();
    await refresh();
    return result;
  }, [refresh]);

  const value: Ctx = {
    state,
    ready,
    ingest: (text, opts) => act(() => ulpfApi.ingest(text, opts)),
    ingestFile: (file) => act(() => ulpfApi.ingestFile(file)),
    approve: async (id, suggestions) => { await act(() => ulpfApi.approve(id, suggestions)); },
    reject: async (id) => { await act(() => ulpfApi.reject(id)); },
    reprocessAll: async () => (await act(() => ulpfApi.reprocess())).count,
    retryDlq: async () => { await act(() => ulpfApi.retryDlq()); },
    reset: async () => { await act(() => ulpfApi.reset()); },
  };
  return <UlpfCtx.Provider value={value}>{children}</UlpfCtx.Provider>;
}

export function useUlpf() {
  const c = useContext(UlpfCtx);
  if (!c) throw new Error("useUlpf must be inside UlpfProvider");
  return c;
}
