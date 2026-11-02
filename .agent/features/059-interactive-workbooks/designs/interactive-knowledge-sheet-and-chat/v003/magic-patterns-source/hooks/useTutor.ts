import { useEffect, useMemo, useReducer, useRef } from 'react';
import type {
  Attachment,
  ComposerState,
  KnowledgeDraft,
  Prefs,
  TutorFlags,
  TutorState,
  WidgetView,
} from '../types/tutor';
import { tutorReducer } from '../utils/tutorReducer';

export function useTutor(initial: TutorState) {
  const [state, dispatch] = useReducer(tutorReducer, initial);
  const isStreaming = state.streaming !== null;
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (!isStreaming) return;
    const id = window.setInterval(() => dispatch({ type: 'tick', now: Date.now() }), 45);
    return () => window.clearInterval(id);
  }, [isStreaming]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const actions = useMemo(
    () => ({
      send: (draftSource: boolean) => dispatch({ type: 'send', now: Date.now(), draftSource }),
      stop: () => dispatch({ type: 'stop' }),
      retry: (messageId: string) => dispatch({ type: 'retry', messageId, now: Date.now() }),
      setComposer: (patch: Partial<ComposerState>) => dispatch({ type: 'composer', patch }),
      addAttachment: (attachment: Attachment) => dispatch({ type: 'addAttachment', attachment }),
      removeAttachment: (id: string) => dispatch({ type: 'removeAttachment', id }),
      setPrefs: (patch: Partial<Prefs>) => dispatch({ type: 'prefs', patch }),
      saveDefaults: () => dispatch({ type: 'saveDefaults' }),
      newConversation: (sourceId: string) => dispatch({ type: 'newConversation', sourceId, now: Date.now() }),
      openForSource: (sourceId: string) => dispatch({ type: 'openForSource', sourceId, now: Date.now() }),
      switchConversation: (id: string) => dispatch({ type: 'switchConversation', id }),
      deleteConversation: (id: string, fallbackSourceId: string) =>
        dispatch({ type: 'deleteConversation', id, fallbackSourceId, now: Date.now() }),
      pageChanged: (sourceId: string) => dispatch({ type: 'pageChanged', sourceId, now: Date.now() }),
      dismissMismatch: () => dispatch({ type: 'dismissMismatch' }),
      fold: () => dispatch({ type: 'fold' }),
      expand: () => dispatch({ type: 'expand' }),
      setView: (view: WidgetView) => dispatch({ type: 'view', view }),
      createDraft: (messageId: string, mode: 'new' | 'update') =>
        dispatch({ type: 'createDraft', messageId, mode, now: Date.now() }),
      openEditor: (draftId: string) => dispatch({ type: 'openEditor', draftId }),
      updateDraft: (id: string, patch: Partial<KnowledgeDraft>) =>
        dispatch({ type: 'updateDraft', id, patch, now: Date.now() }),
      discardDraft: (id: string) => dispatch({ type: 'discardDraft', id }),
      restoreDraft: (id: string) => dispatch({ type: 'restoreDraft', id }),
      saveDraft: (id: string) => {
        dispatch({ type: 'saveDraftStart', id });
        timers.current.push(
          window.setTimeout(() => dispatch({ type: 'saveDraftFinish', id, now: Date.now() }), 1000),
        );
      },
      saveDraftAsNew: (id: string) => dispatch({ type: 'saveDraftAsNew', id }),
      setModel: (model: string) => dispatch({ type: 'setModel', model }),
      dismissAlert: () => dispatch({ type: 'dismissAlert' }),
      sourceUpdated: (sourceId: string) => dispatch({ type: 'sourceUpdated', sourceId }),
      setFlags: (patch: Partial<TutorFlags>) => dispatch({ type: 'flags', patch }),
    }),
    [],
  );

  const active = state.conversations.find((c) => c.id === state.activeId) ?? state.conversations[0];

  return { state, active, ...actions };
}

export type TutorApi = ReturnType<typeof useTutor>;

