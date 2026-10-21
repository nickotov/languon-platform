import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { INTERVIEW_COPY } from '../data/interviewCopy';
import {
  LARGE_ITEMS,
  conflictInterview,
  conflictSaved,
  savedPortrait,
  unfinishedInterview,
} from '../data/samplePortrait';
import type {
  AiStatus,
  ChatState,
  CostMode,
  Interview,
  LangCode,
  LoadState,
  PortraitItems,
  SavedPortrait,
} from '../types/portrait';
import { TODAY, timeLabel } from '../utils/dates';
import { cloneItems, emptyItems } from '../utils/portraitItems';
import { uid } from '../utils/text';

export type ScenarioId =
  | 'none'
  | 'unfinished'
  | 'saved-off'
  | 'in-use'
  | 'expired'
  | 'conflict'
  | 'large';

export interface ToastState {
  id: string;
  title: string;
  description?: string;
  variant: 'info' | 'success' | 'warning' | 'error';
}

interface PrototypeValue {
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
  interfaceLanguage: LangCode;
  setInterfaceLanguage: (l: LangCode) => void;
  costMode: CostMode;
  setCostMode: (m: CostMode) => void;
  paidNoticePending: boolean;
  acknowledgePaidNotice: () => void;
  credits: number;
  setCredits: (n: number) => void;
  aiStatus: AiStatus;
  setAiStatus: (s: AiStatus) => void;
  loadState: LoadState;
  setLoadState: (s: LoadState) => void;
  saveFails: boolean;
  setSaveFails: (b: boolean) => void;
  deleteFails: boolean;
  setDeleteFails: (b: boolean) => void;
  portrait: SavedPortrait | null;
  interview: Interview | null;
  setInterview: React.Dispatch<React.SetStateAction<Interview | null>>;
  expiredOn: string | null;
  dismissExpired: () => void;
  startInterview: (mode: 'new' | 'update') => void;
  discardInterview: () => void;
  savePortrait: (items: PortraitItems, opts: { summaryLanguage: LangCode; fromInterview: boolean }) => Promise<boolean>;
  setUseEnabled: (on: boolean) => void;
  deletePortrait: () => Promise<boolean>;
  chat: ChatState;
  setChat: React.Dispatch<React.SetStateAction<ChatState>>;
  toast: ToastState | null;
  showToast: (t: Omit<ToastState, 'id'>) => void;
  clearToast: () => void;
  demoComposerText: string | null;
  setDemoComposerText: (t: string | null) => void;
  scenario: ScenarioId;
  applyScenario: (id: ScenarioId) => void;
}

const PrototypeContext = createContext<PrototypeValue | null>(null);

export const EXISTING_CHAT: ChatState = {
  isNew: false,
  adoptedPortrait: false,
  excludePortrait: false,
  overrides: { explanationLanguage: 'Spanish', tone: 'formal', length: 'detailed' },
  mode: 'auto',
  fresh: false,
};

export const NEW_CHAT: ChatState = {
  isNew: true,
  adoptedPortrait: false,
  excludePortrait: false,
  overrides: {},
  mode: 'auto',
  fresh: true,
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function PrototypeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [interfaceLanguage, setInterfaceLanguage] = useState<LangCode>('en');
  const [costMode, setCostModeState] = useState<CostMode>('free');
  const [paidNoticePending, setPaidNoticePending] = useState(false);
  const [credits, setCredits] = useState(48);
  const [aiStatus, setAiStatus] = useState<AiStatus>('ok');
  const [loadState, setLoadStateRaw] = useState<LoadState>('ready');
  const [saveFails, setSaveFails] = useState(false);
  const [deleteFails, setDeleteFails] = useState(false);
  const [portrait, setPortrait] = useState<SavedPortrait | null>(null);
  const [interview, setInterview] = useState<Interview | null>(null);
  const [expiredOn, setExpiredOn] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatState>(EXISTING_CHAT);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [demoComposerText, setDemoComposerText] = useState<string | null>(null);
  const [scenario, setScenario] = useState<ScenarioId>('none');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const setLoadState = useCallback((s: LoadState) => {
    setLoadStateRaw(s);
    if (s === 'loading') setTimeout(() => setLoadStateRaw((cur) => (cur === 'loading' ? 'ready' : cur)), 2200);
  }, []);

  const setCostMode = useCallback(
    (m: CostMode) => {
      setCostModeState((prev) => {
        if (prev === 'free' && m === 'paid') setPaidNoticePending(true);
        if (m === 'free') setPaidNoticePending(false);
        return m;
      });
    },
    [],
  );

  const showToast = useCallback((t: Omit<ToastState, 'id'>) => setToast({ ...t, id: uid('toast') }), []);

  const startInterview = useCallback(
    (mode: 'new' | 'update') => {
      const lang = interfaceLanguage;
      const copy = INTERVIEW_COPY[lang];
      const now = TODAY.toISOString();
      const base = portrait ? cloneItems(portrait.items) : emptyItems();
      setExpiredOn(null);
      setInterview({
        mode,
        language: lang,
        phase: mode === 'update' ? 'update-pick' : 'questions',
        topic: 'languages',
        topicStatus: {},
        messages:
          mode === 'update'
            ? [{ id: uid('m'), role: 'interviewer', kind: 'question', text: copy.updateGreeting, time: timeLabel() }]
            : [
                { id: uid('m'), role: 'interviewer', kind: 'question', text: copy.greeting, time: timeLabel() },
                { id: uid('m'), role: 'interviewer', kind: 'question', text: copy.questions.languages.title, time: timeLabel() },
              ],
        draft: base,
        proposals: [],
        startedAt: now,
        lastActivityAt: now,
        conflict: null,
        contextUsed: 0,
      });
    },
    [interfaceLanguage, portrait],
  );

  const discardInterview = useCallback(() => setInterview(null), []);

  const savePortrait = useCallback<PrototypeValue['savePortrait']>(
    async (items, { summaryLanguage, fromInterview }) => {
      await wait(1100);
      if (saveFails) return false;
      setPortrait((prev) => ({
        items: cloneItems(items),
        summaryLanguage,
        updatedAt: TODAY.toISOString(),
        updatedOn: 'this laptop',
        useEnabled: prev?.useEnabled ?? false,
      }));
      if (fromInterview) setInterview(null);
      return true;
    },
    [saveFails],
  );

  const setUseEnabled = useCallback((on: boolean) => {
    setPortrait((prev) => (prev ? { ...prev, useEnabled: on } : prev));
  }, []);

  const deletePortrait = useCallback(async () => {
    await wait(1200);
    if (deleteFails) return false;
    setPortrait(null);
    setInterview(null);
    return true;
  }, [deleteFails]);

  const applyScenario = useCallback((id: ScenarioId) => {
    setScenario(id);
    setExpiredOn(null);
    setLoadStateRaw('ready');
    switch (id) {
      case 'none':
        setPortrait(null);
        setInterview(null);
        break;
      case 'unfinished':
        setPortrait(null);
        setInterview(unfinishedInterview());
        break;
      case 'saved-off':
        setPortrait(savedPortrait(false));
        setInterview(null);
        break;
      case 'in-use':
        setPortrait(savedPortrait(true));
        setInterview(null);
        break;
      case 'expired':
        setPortrait(savedPortrait(true));
        setInterview(null);
        setExpiredOn('2026-10-16T09:00:00');
        break;
      case 'conflict':
        setPortrait(conflictSaved(true));
        setInterview(conflictInterview());
        break;
      case 'large':
        setPortrait(savedPortrait(true, LARGE_ITEMS));
        setInterview(null);
        break;
    }
  }, []);

  const value = useMemo<PrototypeValue>(
    () => ({
      theme,
      setTheme,
      interfaceLanguage,
      setInterfaceLanguage,
      costMode,
      setCostMode,
      paidNoticePending,
      acknowledgePaidNotice: () => setPaidNoticePending(false),
      credits,
      setCredits,
      aiStatus,
      setAiStatus,
      loadState,
      setLoadState,
      saveFails,
      setSaveFails,
      deleteFails,
      setDeleteFails,
      portrait,
      interview,
      setInterview,
      expiredOn,
      dismissExpired: () => setExpiredOn(null),
      startInterview,
      discardInterview,
      savePortrait,
      setUseEnabled,
      deletePortrait,
      chat,
      setChat,
      toast,
      showToast,
      clearToast: () => setToast(null),
      demoComposerText,
      setDemoComposerText,
      scenario,
      applyScenario,
    }),
    [
      theme, interfaceLanguage, costMode, setCostMode, paidNoticePending, credits, aiStatus, loadState, setLoadState,
      saveFails, deleteFails, portrait, interview, expiredOn, startInterview, discardInterview, savePortrait,
      setUseEnabled, deletePortrait, chat, toast, showToast, demoComposerText, scenario, applyScenario,
    ],
  );

  return <PrototypeContext.Provider value={value}>{children}</PrototypeContext.Provider>;
}

export function usePrototype(): PrototypeValue {
  const ctx = useContext(PrototypeContext);
  if (!ctx) throw new Error('usePrototype must be used inside PrototypeProvider');
  return ctx;
}

