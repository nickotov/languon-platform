import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ExerciseAttempt, ExerciseItem, PlaybackStatus, ViewerRole } from '../types/blocks';
import { gradeFreeText } from '../utils/exerciseCheck';

/**
 * Runtime shared by every rendered block: one active playback target, the learner's private
 * exercise progress, and simulated capability flags. Lives above the sheet and chat so state
 * survives layout changes, collapsing and switching between author and learner views.
 */
interface BlockRuntime {
  touch: boolean;
  /** Author, signed-in reader or anonymous reader. Readers' progress/translations are private to them. */
  role: ViewerRole;
  /** Prototype flag: AI-backed requests (answer checks, private translations) fail. */
  aiFails: boolean;
  playing: { id: string; status: PlaybackStatus } | null;
  play: (id: string, text: string) => void;
  stop: () => void;
  attempts: Record<string, ExerciseAttempt>;
  setAnswer: (item: ExerciseItem, answer: string) => void;
  submit: (item: ExerciseItem) => void;
  checkWithAi: (item: ExerciseItem) => void;
  reveal: (item: ExerciseItem) => void;
  useHint: (item: ExerciseItem) => void;
  retry: (item: ExerciseItem) => void;
  expanded: Record<string, boolean>;
  setExpanded: (ids: string[], open: boolean) => void;
}

const Ctx = createContext<BlockRuntime | null>(null);

interface ProviderProps {
  touch: boolean;
  speechUnavailable: boolean;
  aiCheckFails: boolean;
  role?: ViewerRole;
  children: React.ReactNode;
}

export function BlockRuntimeProvider({ touch, speechUnavailable, aiCheckFails, role = 'author', children }: ProviderProps) {
  const [playing, setPlaying] = useState<BlockRuntime['playing']>(null);
  const [attempts, setAttempts] = useState<Record<string, ExerciseAttempt>>({});
  const [expanded, setExpandedState] = useState<Record<string, boolean>>({});
  const timer = useRef(0);
  const flags = useRef({ speechUnavailable, aiCheckFails });
  flags.current = { speechUnavailable, aiCheckFails };

  const stop = useCallback(() => {
    window.clearTimeout(timer.current);
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    setPlaying(null);
  }, []);

  useEffect(() => stop, [stop]);

  /** Model pronunciation playback. Uses the browser's French voice when present; otherwise an honest unavailable state. */
  const play = useCallback(
    (id: string, text: string) => {
      stop();
      setPlaying({ id, status: 'preparing' });
      timer.current = window.setTimeout(() => {
        const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
        if (flags.current.speechUnavailable || !synth) {
          setPlaying({ id, status: 'unavailable' });
          return;
        }
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'fr-FR';
        u.rate = 0.9;
        u.onend = () => setPlaying((cur) => (cur?.id === id ? null : cur));
        u.onerror = () => setPlaying((cur) => (cur?.id === id ? { id, status: 'unavailable' } : cur));
        setPlaying({ id, status: 'playing' });
        synth.speak(u);
        // Fallback end in environments where speech never fires events.
        timer.current = window.setTimeout(() => setPlaying((cur) => (cur?.id === id && cur.status === 'playing' ? null : cur)), Math.max(1800, text.length * 90));
      }, 350);
    },
    [stop],
  );

  const patch = useCallback((item: ExerciseItem, p: Partial<ExerciseAttempt>) => {
    setAttempts((all) => {
      const cur = all[item.id];
      const base: ExerciseAttempt = cur && cur.version === item.version ? cur : { answer: '', version: item.version, submitted: false };
      return { ...all, [item.id]: { ...base, ...p } };
    });
  }, []);

  const setAnswer = useCallback((item: ExerciseItem, answer: string) => patch(item, { answer, submitted: false, result: undefined, feedback: undefined }), [patch]);

  /** Choice and blank answers are compared with the prepared answer locally — no AI call. */
  const submit = useCallback(
    (item: ExerciseItem) => {
      setAttempts((all) => {
        const a = all[item.id];
        if (!a || !a.answer.trim()) return all;
        if (item.kind === 'free') return { ...all, [item.id]: { ...a, submitted: true } };
        const ok = a.answer.trim().toLowerCase() === item.answer.trim().toLowerCase();
        return { ...all, [item.id]: { ...a, submitted: true, result: ok ? 'correct' : 'revise', feedback: undefined } };
      });
    },
    [],
  );

  const checkWithAi = useCallback(
    (item: ExerciseItem) => {
      patch(item, { submitted: true, checking: true, result: undefined, feedback: undefined });
      window.setTimeout(() => {
        setAttempts((all) => {
          const a = all[item.id];
          if (!a) return all;
          if (flags.current.aiCheckFails) return { ...all, [item.id]: { ...a, checking: false, result: 'unavailable' } };
          const graded = gradeFreeText(item, a.answer);
          return { ...all, [item.id]: { ...a, checking: false, ...graded } };
        });
      }, 1300);
    },
    [patch],
  );

  const reveal = useCallback((item: ExerciseItem) => patch(item, { revealed: true }), [patch]);
  const useHint = useCallback((item: ExerciseItem) => patch(item, { hintUsed: true }), [patch]);
  const retry = useCallback((item: ExerciseItem) => patch(item, { submitted: false, result: undefined, feedback: undefined, checking: false }), [patch]);

  const setExpanded = useCallback((ids: string[], open: boolean) => {
    setExpandedState((cur) => {
      const next = { ...cur };
      ids.forEach((id) => (next[id] = open));
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ touch, role, aiFails: aiCheckFails, playing, play, stop, attempts, setAnswer, submit, checkWithAi, reveal, useHint, retry, expanded, setExpanded }),
    [touch, role, aiCheckFails, playing, play, stop, attempts, setAnswer, submit, checkWithAi, reveal, useHint, retry, expanded, setExpanded],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBlockRuntime(): BlockRuntime {
  const v = useContext(Ctx);
  if (!v) throw new Error('useBlockRuntime must be used inside BlockRuntimeProvider');
  return v;
}

