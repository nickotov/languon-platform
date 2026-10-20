import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ChatMode,
  ConflictVersion,
  DocFlags,
  DocMeta,
  DocView,
  RecoveryState,
  Revision,
  SavedVersion,
} from '../types/document';
import type { DocSeed } from '../utils/docScenarioSetup';

export interface ToastState {
  id: number;
  title: string;
  description?: string;
  variant: 'info' | 'success' | 'warning' | 'error';
  action?: { label: string; onClick: () => void };
}

export type DocDialog = 'leave' | 'delete' | null;

export const SHARE_LINK = 'https://languon.app/n/8fk2-ser-estar';

/** Document-level state: title, saved version, recovery, sharing, history, layout. */
export function useDocState(seed: DocSeed) {
  const [title, setTitle] = useState(seed.title);
  const [html, setHtml] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [saved, setSaved] = useState<SavedVersion | null>(seed.saved);
  const [meta, setMeta] = useState<DocMeta>(seed.meta);
  const [metaOpen, setMetaOpen] = useState(seed.metaOpen);
  const [sharingEnabled, setSharingEnabled] = useState(seed.sharingEnabled && seed.saved !== null);
  const [recovery, setRecovery] = useState<RecoveryState>(seed.recovery);
  const [recoveredAt, setRecoveredAt] = useState<number>(Date.now() - 20 * 1000);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [conflict, setConflict] = useState<ConflictVersion | null>(seed.conflict);
  const [view, setView] = useState<DocView>(seed.conflict ? 'conflict' : 'editor');
  const [revisions, setRevisions] = useState<Revision[]>(seed.revisions);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyStatus, setHistoryStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadStatus, setLoadStatus] = useState(seed.loadStatus);
  const [flags, setFlags] = useState<DocFlags>(seed.flags);
  const [chatMode, setChatMode] = useState<ChatMode>(seed.chatMode);
  const [sheetOpen, setSheetOpen] = useState(seed.sheetOpen);
  const [dialog, setDialog] = useState<DocDialog>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const recoveryTimer = useRef(0);
  const initialized = useRef(false);
  const flagsRef = useRef(flags);
  flagsRef.current = flags;

  const notify = useCallback((t: Omit<ToastState, 'id'>) => setToast({ ...t, id: Date.now() }), []);

  const dirty = saved === null ? title.trim() !== '' || bodyText.trim() !== '' : title !== saved.title || html !== saved.html;
  const missingTitle = !title.trim();
  const missingBody = !bodyText.trim();
  const canSave = !missingTitle && !missingBody && (saved === null || dirty) && !saving;

  /** Simulated private server recovery, debounced after each edit. */
  const scheduleRecovery = useCallback(() => {
    if (!initialized.current) return;
    window.clearTimeout(recoveryTimer.current);
    setRecovery('recovering');
    recoveryTimer.current = window.setTimeout(() => {
      const mode = flagsRef.current.recoveryMode;
      if (mode === 'online') {
        setRecovery('recovered');
        setRecoveredAt(Date.now());
      } else setRecovery(mode === 'offline' ? 'local' : 'error');
    }, 1100);
  }, []);

  useEffect(() => () => window.clearTimeout(recoveryTimer.current), []);

  const onEditorChange = useCallback(
    (nextHtml: string, text: string) => {
      setHtml(nextHtml);
      setBodyText(text);
      scheduleRecovery();
    },
    [scheduleRecovery],
  );

  const markInitialized = useCallback((nextHtml: string, text: string) => {
    setHtml(nextHtml);
    setBodyText(text);
    initialized.current = true;
  }, []);

  const changeTitle = (t: string) => {
    setTitle(t);
    scheduleRecovery();
  };

  const retryRecovery = () => {
    setFlags((f) => ({ ...f, recoveryMode: 'online' }));
    flagsRef.current = { ...flagsRef.current, recoveryMode: 'online' };
    scheduleRecovery();
  };

  const save = (after?: () => void) => {
    if (!canSave) return;
    setSaving(true);
    setSaveError(false);
    window.setTimeout(() => {
      setSaving(false);
      if (flagsRef.current.saveFails) {
        setSaveError(true);
        setFlags((f) => ({ ...f, saveFails: false }));
        return;
      }
      const at = Date.now();
      setSaved({ title, html, savedAt: at });
      setRevisions((r) => [{ id: `r-${at}`, label: 'Saved version', title, html, at, device: 'This laptop', kind: 'saved' }, ...r]);
      notify({
        variant: 'success',
        title: 'Saved',
        description: sharingEnabled ? 'The read-only link now shows this version.' : 'This version is now in Knowledge.',
      });
      after?.();
    }, 900);
  };

  const openHistory = () => {
    setHistoryOpen(true);
    setHistoryStatus('loading');
    window.setTimeout(() => setHistoryStatus(flagsRef.current.historyFails ? 'error' : 'ready'), 700);
  };

  const retryHistory = () => {
    setFlags((f) => ({ ...f, historyFails: false }));
    flagsRef.current = { ...flagsRef.current, historyFails: false };
    openHistory();
  };

  const keepRevision = (label: string, keptTitle: string, keptHtml: string, device = 'This laptop') => {
    const at = Date.now();
    setRevisions((r) => [{ id: `k-${at}`, label, title: keptTitle, html: keptHtml, at, device, kind: 'kept' }, ...r]);
  };

  return {
    title,
    changeTitle,
    setTitle,
    html,
    bodyText,
    saved,
    meta,
    setMeta,
    metaOpen,
    setMetaOpen,
    sharingEnabled,
    setSharingEnabled,
    recovery,
    recoveredAt,
    retryRecovery,
    saving,
    saveError,
    setSaveError,
    conflict,
    setConflict,
    view,
    setView,
    revisions,
    keepRevision,
    historyOpen,
    setHistoryOpen,
    historyStatus,
    openHistory,
    retryHistory,
    loadStatus,
    setLoadStatus,
    flags,
    setFlags,
    chatMode,
    setChatMode,
    sheetOpen,
    setSheetOpen,
    dialog,
    setDialog,
    toast,
    setToast,
    notify,
    dirty,
    missingTitle,
    missingBody,
    canSave,
    save,
    onEditorChange,
    markInitialized,
  };
}

export type DocStateApi = ReturnType<typeof useDocState>;

