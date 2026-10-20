import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatPrefs, DocChatMessage, PassageAttachment, Reference, SelectionAction } from '../types/document';
import { PENDING } from '../utils/richEditor';
import type { RichEditor } from '../utils/richEditor';
import { blocksLength, chunkEnd } from '../utils/richText';
import { formatChars } from '../utils/docCompare';
import { buildReply } from '../utils/tutorReplies';
import { ru } from '../data/strings';

export const DEFAULT_LIMIT = 40000;
export const LOW_DOC_LIMIT = 1500;
export const LOW_REF_LIMIT = 2000;
export const DEFAULT_PREFS: ChatPrefs = { mode: 'auto', tone: 'neutral', level: 'auto', context: 'document', model: 'flash' };

const READING_MS = 650;
const PREPARING_MS = 650;
const TICK_MS = 40;
const ACTIVE: ReadonlyArray<string> = ['reading', 'preparing', 'streaming'];
const DEFAULT_SECTION = 'Где я ещё сомневаюсь';

let seq = 0;
const nextId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;
const chars = (n: number) => ru.common.chars(formatChars(n));

interface SendOptions {
  text?: string;
  action?: SelectionAction;
  passage?: PassageAttachment;
}

interface DocChatInit {
  messages: DocChatMessage[];
  references: Reference[];
  lowLimits: boolean;
  failNextReply: boolean;
}

/** Thin chat model: messages, attachments, preferences, limits and simulated streaming replies. */
export function useDocChat(initial: DocChatInit) {
  const [messages, setMessagesState] = useState<DocChatMessage[]>(initial.messages);
  const messagesRef = useRef(messages);
  const [text, setText] = useState('');
  const [passage, setPassage] = useState<PassageAttachment | null>(null);
  const [references, setReferences] = useState<Reference[]>(initial.references);
  const [sendError, setSendError] = useState<string | null>(null);
  const [refError, setRefError] = useState<string | null>(null);
  const [lowLimits, setLowLimits] = useState(initial.lowLimits);
  const [prefs, setPrefsState] = useState<ChatPrefs>(DEFAULT_PREFS);
  const [defaults, setDefaults] = useState<ChatPrefs>(DEFAULT_PREFS);
  const [defaultsSaved, setDefaultsSaved] = useState(false);
  const [failNextReply, setFailNextReplyState] = useState(initial.failNextReply);
  const failNext = useRef(initial.failNextReply);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const timers = useRef<number[]>([]);

  const docLimit = lowLimits ? LOW_DOC_LIMIT : DEFAULT_LIMIT;
  const refLimit = lowLimits ? LOW_REF_LIMIT : DEFAULT_LIMIT;
  const refChars = references.reduce((n, r) => n + r.text.length, 0);
  const streaming = messages.some((m) => ACTIVE.includes(m.status ?? ''));
  const prefsChanged = JSON.stringify(prefs) !== JSON.stringify(defaults);

  const setMessages = useCallback((next: DocChatMessage[] | ((list: DocChatMessage[]) => DocChatMessage[])) => {
    const value = typeof next === 'function' ? next(messagesRef.current) : next;
    messagesRef.current = value;
    setMessagesState(value);
  }, []);

  const patch = useCallback(
    (id: string, p: Partial<DocChatMessage>) => setMessages((list) => list.map((m) => (m.id === id ? { ...m, ...p } : m))),
    [setMessages],
  );

  /** Reading the document → preparing → streaming. Real task activity, no fake progress. */
  const startPipeline = useCallback(
    (replyId: string) => {
      timers.current.push(window.setTimeout(() => patch(replyId, { status: 'preparing' }), READING_MS));
      timers.current.push(
        window.setTimeout(() => {
          patch(replyId, { status: 'streaming' });
          setStreamingId(replyId);
        }, READING_MS + PREPARING_MS),
      );
    },
    [patch],
  );

  useEffect(() => {
    const pending = initial.messages.find((m) => m.role === 'tutor' && m.status === 'reading');
    if (pending) startPipeline(pending.id);
    const list = timers.current;
    return () => list.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!streamingId) return;
    const timer = window.setInterval(() => {
      const m = messagesRef.current.find((x) => x.id === streamingId);
      if (!m || !m.blocks) {
        setStreamingId(null);
        return;
      }
      const total = blocksLength(m.blocks);
      const end = chunkEnd(m.blocks, m.revealed ?? 0);
      if (m.willFail && end >= total * 0.45) {
        patch(m.id, { revealed: end, status: 'failed' });
        setStreamingId(null);
      } else if (end >= total) {
        patch(m.id, { revealed: total, status: 'done' });
        setStreamingId(null);
      } else patch(m.id, { revealed: end, status: 'streaming' });
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [streamingId, patch]);

  const setFailNextReply = (on: boolean) => {
    failNext.current = on;
    setFailNextReplyState(on);
  };

  /** Attach a specific range as the pending passage (Ask tutor, selection actions, scenario seeding). */
  const attachRange = useCallback((editor: RichEditor, range: Range, selected: string, heading?: string) => {
    editor.setTarget(PENDING, range, selected);
    editor.setActiveTarget(PENDING);
    setPassage({ text: selected, blockLabel: heading ?? DEFAULT_SECTION });
    setSendError(null);
  }, []);

  const removePassage = useCallback((editor: RichEditor | null) => {
    editor?.removeTarget(PENDING);
    setPassage(null);
  }, []);

  const addReference = (ref: Reference): boolean => {
    if (references.some((r) => r.id === ref.id)) return true;
    if (refChars + ref.text.length > refLimit) {
      setRefError(ru.picker.refLimit(ref.title, chars(refLimit), chars(ref.text.length), chars(refChars)));
      return false;
    }
    setRefError(null);
    setReferences((r) => [...r, ref]);
    return true;
  };

  const removeReference = (id: string) => {
    setReferences((r) => r.filter((x) => x.id !== id));
    setRefError(null);
  };

  const send = (editor: RichEditor | null, opts: SendOptions = {}): boolean => {
    if (!editor || streaming) return false;
    const pass = opts.passage ?? passage;
    const question = (opts.text ?? text).trim();
    if (!question && !pass) return false;
    const docChars = editor.getText().length;
    const selectionOnly = prefs.context === 'selection' && pass !== null;
    if (docChars > docLimit && !selectionOnly) {
      setSendError(ru.composer.overLimit(chars(docChars), chars(docLimit)));
      return false;
    }
    setSendError(null);
    const id = nextId();
    if (pass && editor.getTarget(PENDING)) editor.renameTarget(PENDING, id);
    else editor.setTarget(id, editor.cursorRange(), '');
    const content = buildReply(question, pass?.text, opts.action);
    const user: DocChatMessage = {
      id,
      role: 'user',
      text: question || ru.actionPrompts.explain,
      passage: pass ?? undefined,
      references: references.length ? references : undefined,
      action: opts.action,
      targetId: id,
    };
    const reply: DocChatMessage = {
      id: `${id}-r`,
      role: 'tutor',
      text: '',
      blocks: content.blocks,
      revealed: 0,
      status: 'reading',
      suggestion: content.suggestion,
      action: opts.action,
      willFail: failNext.current,
      contextChars: selectionOnly ? (pass?.text.length ?? 0) : docChars,
      targetId: id,
    };
    if (failNext.current) setFailNextReply(false);
    setMessages((list) => [...list, user, reply]);
    if (opts.text === undefined) setText('');
    setPassage(null);
    setReferences([]);
    startPipeline(reply.id);
    return true;
  };

  /** Only the explicit Stop cancels a reply; the text received so far is kept. */
  const stop = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    const active = messagesRef.current.find((m) => m.role === 'tutor' && ACTIVE.includes(m.status ?? ''));
    if (active) patch(active.id, { status: 'stopped' });
    setStreamingId(null);
  };

  const retry = (id: string) => {
    if (streaming) return;
    patch(id, { revealed: 0, status: 'reading', willFail: failNext.current });
    if (failNext.current) setFailNextReply(false);
    startPipeline(id);
  };

  const newConversation = (editor: RichEditor | null) => {
    stop();
    setMessages([]);
    removePassage(editor);
    setReferences([]);
    setText('');
    setSendError(null);
  };

  const setPrefs = (p: Partial<ChatPrefs>) => {
    setPrefsState((cur) => ({ ...cur, ...p }));
    setDefaultsSaved(false);
  };

  const saveDefaults = () => {
    setDefaults(prefs);
    setDefaultsSaved(true);
  };

  return {
    messages,
    text,
    setText,
    passage,
    attachRange,
    removePassage,
    references,
    addReference,
    removeReference,
    refChars,
    refError,
    setRefError,
    sendError,
    setSendError,
    docLimit,
    refLimit,
    lowLimits,
    setLowLimits,
    prefs,
    setPrefs,
    prefsChanged,
    defaultsSaved,
    saveDefaults,
    failNextReply,
    setFailNextReply,
    streaming,
    send,
    stop,
    retry,
    newConversation,
  };
}

export type DocChatApi = ReturnType<typeof useDocChat>;

