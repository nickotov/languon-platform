import { useCallback, useEffect, useRef, useState } from 'react';
import type { DocChatMessage, PassageAttachment, Reference } from '../types/document';
import { tutorScripts } from '../data/documentContent';
import { PENDING } from '../utils/richEditor';
import type { RichEditor } from '../utils/richEditor';
import { blocksLength, chunkEnd } from '../utils/richText';
import { formatChars } from '../utils/docCompare';

export const DEFAULT_LIMIT = 40000;
export const LOW_DOC_LIMIT = 1500;
export const LOW_REF_LIMIT = 2000;

function pickScript(text: string, passage?: PassageAttachment): keyof typeof tutorScripts {
  const t = `${text} ${passage?.text ?? ''}`.toLowerCase();
  if (/muert|dead|death/.test(t)) return 'death';
  if (/event|fiesta|evento|for events|está for/.test(t)) return 'events';
  if (/practi|exercise|quiz/.test(t)) return 'practice';
  if (passage) return 'generic';
  return 'summary';
}

let seq = 0;
const nextId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Thin chat model: messages, attachments, limits and simulated tutor replies. */
export function useDocChat(initial: { messages: DocChatMessage[]; references: Reference[]; lowLimits: boolean }) {
  const [messages, setMessages] = useState<DocChatMessage[]>(initial.messages);
  const [text, setText] = useState('');
  const [passage, setPassage] = useState<PassageAttachment | null>(null);
  const [references, setReferences] = useState<Reference[]>(initial.references);
  const [sendError, setSendError] = useState<string | null>(null);
  const [refError, setRefError] = useState<string | null>(null);
  const [lowLimits, setLowLimits] = useState(initial.lowLimits);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const timer = useRef(0);

  const docLimit = lowLimits ? LOW_DOC_LIMIT : DEFAULT_LIMIT;
  const refLimit = lowLimits ? LOW_REF_LIMIT : DEFAULT_LIMIT;
  const refChars = references.reduce((n, r) => n + r.text.length, 0);

  useEffect(() => {
    if (!streamingId) return;
    timer.current = window.setInterval(() => {
      setMessages((list) =>
        list.map((m) => {
          if (m.id !== streamingId || !m.blocks) return m;
          const total = blocksLength(m.blocks);
          const end = chunkEnd(m.blocks, m.revealed ?? 0);
          if (end >= total) {
            window.setTimeout(() => setStreamingId(null), 0);
            return { ...m, revealed: total, status: 'done' };
          }
          return { ...m, revealed: end, status: 'streaming' };
        }),
      );
    }, 40);
    return () => window.clearInterval(timer.current);
  }, [streamingId]);

  /** Attach a specific range as the pending passage (used by Ask tutor and scenario seeding). */
  const attachRange = useCallback((editor: RichEditor, range: Range, selected: string, heading?: string) => {
    editor.setTarget(PENDING, range, selected);
    editor.setActiveTarget(PENDING);
    setPassage({ text: selected, blockLabel: heading ?? 'Where I still hesitate' });
    setSendError(null);
  }, []);

  const attachSelection = useCallback(
    (editor: RichEditor) => {
      const info = editor.selectionInfo();
      if (!info) return false;
      attachRange(editor, info.range, info.text, info.heading);
      return true;
    },
    [attachRange],
  );

  const removePassage = useCallback((editor: RichEditor | null) => {
    editor?.removeTarget(PENDING);
    setPassage(null);
  }, []);

  const addReference = (ref: Reference): boolean => {
    if (references.some((r) => r.id === ref.id)) return true;
    if (refChars + ref.text.length > refLimit) {
      setRefError(
        `Can’t add “${ref.title}” — copied references are limited to ${formatChars(refLimit)} characters in total (this one is ${formatChars(ref.text.length)}, ${formatChars(refChars)} already attached).`,
      );
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

  const send = (editor: RichEditor | null): boolean => {
    if (!editor || streamingId) return false;
    const question = text.trim();
    if (!question && !passage) return false;
    const docChars = editor.getText().length;
    if (docChars > docLimit) {
      setSendError(`Your document is ${formatChars(docChars)} characters — the tutor can read up to ${formatChars(docLimit)}. Shorten it, then send.`);
      return false;
    }
    setSendError(null);
    const id = nextId();
    if (passage && editor.getTarget(PENDING)) editor.renameTarget(PENDING, id);
    else editor.setTarget(id, editor.cursorRange(), '');
    const script = tutorScripts[pickScript(question, passage ?? undefined)];
    const user: DocChatMessage = {
      id,
      role: 'user',
      text: question || 'Can you explain this passage?',
      passage: passage ?? undefined,
      references: references.length ? references : undefined,
      targetId: id,
    };
    const replyId = `${id}-r`;
    const reply: DocChatMessage = {
      id: replyId,
      role: 'tutor',
      text: '',
      blocks: script.blocks,
      revealed: 0,
      status: 'reading',
      suggestion: script.suggestion,
      targetId: id,
    };
    setMessages((list) => [...list, user, reply]);
    setText('');
    setPassage(null);
    setReferences([]);
    window.setTimeout(() => setStreamingId(replyId), 900);
    return true;
  };

  return {
    messages,
    setMessages,
    text,
    setText,
    passage,
    setPassage,
    attachRange,
    attachSelection,
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
    streaming: streamingId !== null || messages.some((m) => m.status === 'reading'),
    send,
  };
}

export type DocChatApi = ReturnType<typeof useDocChat>;

