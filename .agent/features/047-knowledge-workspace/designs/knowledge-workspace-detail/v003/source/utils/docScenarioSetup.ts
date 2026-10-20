import type {
  ChatMode,
  ConflictVersion,
  DocChatMessage,
  DocFlags,
  DocMeta,
  Reference,
  Revision,
  SavedVersion,
} from '../types/document';
import {
  DOC_TITLE,
  copiedReferences,
  emptyMeta,
  filledMeta,
  otherDeviceHtml,
  savedDocHtml,
  tutorScripts,
  workingDocHtml,
} from '../data/documentContent';
import { blocksLength } from './richText';
import { normalizeHtml } from './richEditor';

const MIN = 60 * 1000;

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
  metaOpen: boolean;
  sharingEnabled: boolean;
  chatMode: ChatMode;
  sheetOpen: boolean;
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
  recovery: 'recovered' | 'recovering';
}

function tutorDone(id: string, targetId: string, script: keyof typeof tutorScripts): DocChatMessage {
  const s = tutorScripts[script];
  return {
    id,
    role: 'tutor',
    text: '',
    blocks: s.blocks,
    revealed: blocksLength(s.blocks),
    status: 'done',
    suggestion: s.suggestion,
    targetId,
  };
}

export function buildDocSeed(id: string, now: number): DocSeed {
  const savedHtml = normalizeHtml(savedDocHtml);
  const saved: SavedVersion = { title: DOC_TITLE, html: savedHtml, savedAt: now - 42 * MIN };
  const revisions: Revision[] = [
    { id: 'r3', label: 'Saved version', title: DOC_TITLE, html: savedHtml, at: now - 42 * MIN, device: 'This laptop', kind: 'saved' },
    {
      id: 'r2',
      label: 'Saved version',
      title: 'Ser vs estar',
      html: normalizeHtml(savedDocHtml.split('<h2>Where I still hesitate</h2>')[0]),
      at: now - 26 * 60 * MIN,
      device: 'Phone',
      kind: 'saved',
    },
    {
      id: 'r1',
      label: 'First save',
      title: 'Ser vs estar',
      html: normalizeHtml(savedDocHtml.split('<h2>Adjectives that change meaning</h2>')[0]),
      at: now - 4 * 24 * 60 * MIN,
      device: 'This laptop',
      kind: 'saved',
    },
  ];

  const defaultMessages: DocChatMessage[] = [
    {
      id: 'seed-u',
      role: 'user',
      text: 'Is my explanation of “está muerto” right?',
      passage: { text: 'My guess is that estar marks the result of a change rather than a temporary state.', blockLabel: 'Where I still hesitate' },
      targetId: 'seed-u',
    },
    tutorDone('seed-u-r', 'seed-u', 'death'),
  ];

  const base: DocSeed = {
    title: DOC_TITLE,
    html: workingDocHtml,
    saved,
    meta: filledMeta,
    metaOpen: false,
    sharingEnabled: true,
    chatMode: 'docked',
    sheetOpen: false,
    conflict: null,
    historyOpen: false,
    loadStatus: 'ready',
    flags: { saveFails: false, historyFails: false, recoveryMode: 'online', lowLimits: false },
    messages: defaultMessages,
    references: [copiedReferences[0]],
    revisions,
    pendingPassage: 'I keep writing está for events because it feels like a place.',
    seedTargets: [{ messageId: 'seed-u', sentence: 'My guess is that estar marks the result of a change rather than a temporary state.' }],
    reviewId: null,
    recovery: 'recovered',
  };

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
    case 'chat-half':
      return { ...base, chatMode: 'half' };
    case 'chat-closed':
      return { ...base, chatMode: 'closed', pendingPassage: undefined, metaOpen: true };
    case 'chat-floating':
      return { ...base, chatMode: 'floating' };
    case 'proposal':
    case 'proposal-changed': {
      const sentence = 'I keep writing está for events because it feels like a place.';
      return {
        ...base,
        references: [],
        pendingPassage: undefined,
        messages: [
          ...defaultMessages,
          { id: 'prop-u', role: 'user', text: 'Why do events use ser here?', passage: { text: sentence, blockLabel: 'Where I still hesitate' }, targetId: 'prop-u' },
          tutorDone('prop-u-r', 'prop-u', 'events'),
        ],
        seedTargets: [
          ...base.seedTargets,
          {
            messageId: 'prop-u',
            sentence,
            changeTo: id === 'proposal-changed' ? { find: 'for events', replace: 'for parties and meetings' } : undefined,
          },
        ],
        reviewId: 'prop-u-r',
      };
    }
    case 'limits':
      return { ...base, flags: { ...base.flags, lowLimits: true }, references: [copiedReferences[0]] };
    case 'conflict':
      return {
        ...base,
        conflict: { device: 'Phone', at: now - 3 * MIN, title: DOC_TITLE, html: normalizeHtml(otherDeviceHtml) },
        pendingPassage: undefined,
      };
    case 'history':
      return { ...base, historyOpen: true, pendingPassage: undefined };
    case 'loading':
      return { ...base, loadStatus: 'loading' };
    case 'load-error':
      return { ...base, loadStatus: 'error' };
    case 'mobile-closed':
      return { ...base, pendingPassage: undefined };
    case 'mobile-open':
      return { ...base, sheetOpen: true };
    default:
      return base;
  }
}

