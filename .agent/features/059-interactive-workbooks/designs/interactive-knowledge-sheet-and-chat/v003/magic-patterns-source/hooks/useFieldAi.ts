import { useCallback, useEffect, useRef, useState } from 'react';

export type FieldAiKind = 'check' | 'generate';

export interface FieldAiState {
  kind: FieldAiKind;
  status: 'pending' | 'ok' | 'suggest' | 'failed';
  /** Value of the field when the request was made. */
  captured: string;
  proposed?: string;
  note?: string;
}

export type FieldAiResolver = (fieldKey: string, kind: FieldAiKind, value: string) => { ok: boolean; proposed?: string; note?: string };

/**
 * Atomic AI actions on single editor fields. Each request records its target field and value;
 * only that field shows progress. If the field changes meanwhile, the result is stale.
 * Unmounting (Cancel / close) drops any late result.
 */
export function useFieldAi(resolve: FieldAiResolver, failNext: boolean) {
  const [states, setStates] = useState<Record<string, FieldAiState>>({});
  const timers = useRef<number[]>([]);
  const resolveRef = useRef(resolve);
  resolveRef.current = resolve;
  const failRef = useRef(failNext);
  failRef.current = failNext;

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const run = useCallback((fieldKey: string, kind: FieldAiKind, value: string) => {
    setStates((s) => ({ ...s, [fieldKey]: { kind, status: 'pending', captured: value } }));
    const t = window.setTimeout(() => {
      setStates((s) => {
        const cur = s[fieldKey];
        if (!cur || cur.status !== 'pending') return s;
        if (failRef.current) return { ...s, [fieldKey]: { ...cur, status: 'failed' } };
        const r = resolveRef.current(fieldKey, kind, cur.captured);
        // No usable result (e.g. nothing to suggest) is reported as a failure, never as "looks correct".
        const status = r.ok ? 'ok' : r.proposed ? 'suggest' : 'failed';
        return { ...s, [fieldKey]: { ...cur, status, proposed: r.proposed, note: r.note } };
      });
    }, 1100);
    timers.current.push(t);
  }, []);

  const clear = useCallback((fieldKey: string) => {
    setStates((s) => {
      const next = { ...s };
      delete next[fieldKey];
      return next;
    });
  }, []);

  return { states, run, clear };
}

export type FieldAiApi = ReturnType<typeof useFieldAi>;

