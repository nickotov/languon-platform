import type {
  ConflictVersion,
  DocChatMessage,
  DocFlags,
  DocMeta,
  LayoutMode,
  MobileTab,
  Reference,
  Revision,
  SavedVersion,
} from '../types/document';
import {
  CHECK_SENTENCE,
  DOC_TITLE,
  GUESS_SENTENCE,
  TARGET_SENTENCE,
  copiedReferences,
  emptyMeta,
  filledMeta,
  otherDeviceHtml,
  savedDocHtml,
  tutorScripts,
  workingDocHtml,
} from '../data/documentContent';
import { ru } from '../data/strings';
import { blocksLength } from './richText';
import { normalizeHtml } from './richEditor';
import { buildReply } from './tutorReplies';
import type { ReplyContent } from './tutorReplies';

const MIN = 60 * 1000;
const SECTION = 'Где я ещё сомневаюсь';

export interface SeedTarget {
  messageId: string;
  sentence: string;
  /** Simulate the target text being edited while the tutor was replying. */
  changeTo?: { find: string; replace: string };
}

export interface DocSeed {
  title: string;
  html: string;
  saved: SavedVersion | null;
  meta: DocMeta;
  sharingEnabled: boolean;
  chatMode: LayoutMode;
  /** Scenario is about layout, so it overrides the remembered layout. */
  layoutExplicit: boolean;
  mobileTab: MobileTab;
  conflict: ConflictVersion | null;
  historyOpen: boolean;
  loadStatus: 'loading' | 'error' | 'ready';
  flags: DocFlags;
  messages: DocChatMessage[];
  references: Reference[];
  revisions: Revision[];
  /** Sentence in the document to attach as the pending selected passage. */
  pendingPassage?: string;
  seedTargets: SeedTarget[];
  reviewId: string | null;
  inlineReviewId: string | null;
  recovery: 'recovered' | 'recovering';
}

function tutor(id: string, targetId: string, content: ReplyContent, status: DocChatMessage['status'] = 'done', revealed?: number): DocChatMessage {
  return {
    id,
    role: 'tutor',
    text: '',
    blocks: content.blocks,
    revealed: revealed ?? (status === 'done' ? blocksLength(content.blocks) : 0),
    status,
    suggestion: content.suggestion,
    targetId,
  };
}

export function buildDocSeed(id: string, now: number): DocSeed {
  const savedHtml = normalizeHtml(savedDocHtml);
  const saved: SavedVersion = { title: DOC_TITLE, html: savedHtml, savedAt: now - 42 * MIN };
  const revisions: Revision[] = [
    { id: 'r3', label: ru.revisions.saved, title: DOC_TITLE, html: savedHtml, at: now - 42 * MIN, device: ru.revisions.thisDevice, kind: 'saved' },
    {
      id: 'r2',
      label: ru.revisions.saved,
      title: 'Ser и estar',
      html: normalizeHtml(savedDocHtml.split(`<h2>${SECTION}</h2>`)[0]),
      at: now - 26 * 60 * MIN,
      device: ru.revisions.phone,
      kind: 'saved',
    },
    {
      id: 'r1',
      label: ru.revisions.first,
      title: 'Ser и estar',
      html: normalizeHtml(savedDocHtml.split('<h2>Прилагательные, которые меняют смысл</h2>')[0]),
      at: now - 4 * 24 * 60 * MIN,
      device: ru.revisions.thisDevice,
      kind: 'saved',
    },
  ];

  const defaultMessages: DocChatMessage[] = [
    {
      id: 'seed-u',
      role: 'user',
      text: 'Правильно ли я объясняю «está muerto»?',
      passage: { text: GUESS_SENTENCE, blockLabel: SECTION },
      targetId: 'seed-u',
    },
    tutor('seed-u-r', 'seed-u', tutorScripts.death),
  ];

  const base: DocSeed = {
    title: DOC_TITLE,
    html: workingDocHtml,
    saved,
    meta: filledMeta,
    sharingEnabled: true,
    chatMode: 'split',
    layoutExplicit: false,
    mobileTab: 'doc',
    conflict: null,
    historyOpen: false,
    loadStatus: 'ready',
    flags: { saveFails: false, historyFails: false, recoveryMode: 'online', lowLimits: false, failNextReply: false },
    messages: defaultMessages,
    references: [copiedReferences[0]],
    revisions,
    pendingPassage: TARGET_SENTENCE,
    seedTargets: [{ messageId: 'seed-u', sentence: GUESS_SENTENCE }],
    reviewId: null,
    inlineReviewId: null,
    recovery: 'recovered',
  };
  const quiet = { ...base, pendingPassage: undefined, references: [] as Reference[] };

  switch (id) {
    case 'new':
      return {
        ...base,
        title: '',
        html: '',
        saved: null,
        meta: emptyMeta,
        sharingEnabled: false,
        messages: [],
        references: [],
        revisions: [],
        pendingPassage: undefined,
        seedTargets: [],
      };
    case 'chat-closed':
      return { ...quiet, chatMode: 'focus', layoutExplicit: true };
    case 'chat-focus':
      return { ...base, chatMode: 'chat', layoutExplicit: true };
    case 'narrow':
    case 'tablet':
      return { ...base, chatMode: 'split', layoutExplicit: true };
    case 'inline-correct': {
      const reply = buildReply(ru.actionPrompts.correct, CHECK_SENTENCE, 'correct');
      return {
        ...quiet,
        messages: [
          ...defaultMessages,
          { id: 'fix-u', role: 'user', text: ru.actionPrompts.correct, passage: { text: CHECK_SENTENCE, blockLabel: 'Мои предложения на проверку' }, action: 'correct', targetId: 'fix-u' },
          { ...tutor('fix-u-r', 'fix-u', reply), action: 'correct' },
        ],
        seedTargets: [...base.seedTargets, { messageId: 'fix-u', sentence: CHECK_SENTENCE }],
        inlineReviewId: 'fix-u-r',
      };
    }
    case 'proposal-changed': {
      const reply = buildReply(ru.actionPrompts.rephrase, TARGET_SENTENCE, 'rephrase');
      return {
        ...quiet,
        messages: [
          ...defaultMessages,
          { id: 'prop-u', role: 'user', text: ru.actionPrompts.rephrase, passage: { text: TARGET_SENTENCE, blockLabel: SECTION }, action: 'rephrase', targetId: 'prop-u' },
          { ...tutor('prop-u-r', 'prop-u', reply), action: 'rephrase' },
        ],
        seedTargets: [...base.seedTargets, { messageId: 'prop-u', sentence: TARGET_SENTENCE, changeTo: { find: 'для событий', replace: 'для праздников и встреч' } }],
        inlineReviewId: 'prop-u-r',
      };
    }
    case 'proposal':
      return {
        ...quiet,
        messages: [
          ...defaultMessages,
          { id: 'prop-u', role: 'user', text: 'Почему для событий нужен ser?', passage: { text: TARGET_SENTENCE, blockLabel: SECTION }, targetId: 'prop-u' },
          tutor('prop-u-r', 'prop-u', tutorScripts.events),
        ],
        seedTargets: [...base.seedTargets, { messageId: 'prop-u', sentence: TARGET_SENTENCE }],
        reviewId: 'prop-u-r',
      };
    case 'streaming':
      return {
        ...quiet,
        messages: [
          ...defaultMessages,
          { id: 'str-u', role: 'user', text: ru.chat.prompts[1], targetId: 'str-u' },
          tutor('str-u-r', 'str-u', tutorScripts.practice, 'reading'),
        ],
      };
    case 'stopped':
      return {
        ...quiet,
        messages: [
          ...defaultMessages,
          { id: 'stp-u', role: 'user', text: ru.chat.prompts[2], targetId: 'stp-u' },
          tutor('stp-u-r', 'stp-u', tutorScripts.contrast, 'stopped', 96),
        ],
      };
    case 'limits':
      return { ...base, flags: { ...base.flags, lowLimits: true }, references: [copiedReferences[0]] };
    case 'conflict':
      return {
        ...quiet,
        conflict: { device: ru.revisions.phone, at: now - 3 * MIN, title: DOC_TITLE, html: normalizeHtml(otherDeviceHtml) },
      };
    case 'history':
      return { ...quiet, historyOpen: true };
    case 'loading':
      return { ...base, loadStatus: 'loading' };
    case 'load-error':
      return { ...base, loadStatus: 'error' };
    case 'mobile-doc':
      return { ...quiet, mobileTab: 'doc' };
    case 'mobile-tutor':
      return { ...base, mobileTab: 'tutor' };
    default:
      return base;
  }
}

