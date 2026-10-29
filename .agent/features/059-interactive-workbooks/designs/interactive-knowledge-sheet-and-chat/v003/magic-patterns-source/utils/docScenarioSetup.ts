import type { ConflictVersion, DocChatMessage, DocFlags, DocMeta, LayoutMode, MobileTab, Reference, Revision, SavedVersion } from '../types/document';
import type { SheetNode } from '../types/blocks';
import {
  CHECK_SECTION,
  CHECK_SENTENCE,
  DOC_TITLE,
  GUESS_SENTENCE,
  SECTION,
  TARGET_SENTENCE,
  copiedReferences,
  emptyMeta,
  filledMeta,
  otherDeviceHtml,
  savedDocHtml,
  tutorScripts,
  workingDocHtml,
} from '../data/documentContent';
import { audioBlock, bilingualBlock, grammarBlock, savedExercisesBlock, savedVocabularyBlock, videoBlock } from '../data/blockSamples';
import { ru } from '../data/strings';
import { blocksLength } from './richText';
import { normalizeHtml } from './richEditor';
import { buildReply } from './tutorReplies';
import type { ReplyContent } from './tutorReplies';
import { blockKey, blockNode, proseNode, serializeBlocks } from './sheetNodes';

const MIN = 60 * 1000;
const VOCAB_PROMPT = ru.chat.prompts[0];

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
  pendingPassage?: string;
  seedTargets: SeedTarget[];
  reviewId: string | null;
  inlineReviewId: string | null;
  recovery: 'recovered' | 'recovering';
  nodes: SheetNode[];
  blocksKey: string;
  blockCount: number;
  selectedBlockId: string | null;
  editorBlockId: string | null;
  proposalReviewId: string | null;
  learnerPreview: boolean;
  /** Who is viewing: the author, or someone with the share link. */
  viewer: 'author' | 'reader' | 'anonymous' | 'revoked';
  updatedSinceCompletion: boolean;
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
    proposal: content.proposal,
    targetId,
  };
}

const defaultFlags: DocFlags = {
  saveFails: false,
  historyFails: false,
  recoveryMode: 'online',
  lowLimits: false,
  failNextReply: false,
  applyFails: false,
  speechUnavailable: false,
  fieldCheckFails: false,
  librarySaveFails: false,
};

export function buildDocSeed(id: string, now: number): DocSeed {
  const savedNodes: SheetNode[] = [
    proseNode,
    blockNode(savedVocabularyBlock),
    blockNode(grammarBlock),
    blockNode(bilingualBlock),
    blockNode(audioBlock),
    blockNode(videoBlock),
    blockNode(savedExercisesBlock),
  ];
  const savedHtml = normalizeHtml(savedDocHtml);
  const savedKey = serializeBlocks(savedNodes);
  const saved: SavedVersion = { title: DOC_TITLE, html: savedHtml, blocksKey: savedKey, savedAt: now - 42 * MIN };
  const revisions: Revision[] = [
    { id: 'r3', label: ru.revisions.saved, title: DOC_TITLE, html: savedHtml, at: now - 42 * MIN, device: ru.revisions.thisDevice, kind: 'saved' },
    {
      id: 'r2',
      label: ru.revisions.saved,
      title: 'Le ménage',
      html: normalizeHtml(savedDocHtml.split(`<h2>${SECTION}</h2>`)[0]),
      at: now - 26 * 60 * MIN,
      device: ru.revisions.phone,
      kind: 'saved',
    },
    {
      id: 'r1',
      label: ru.revisions.first,
      title: 'Le ménage',
      html: normalizeHtml(savedDocHtml.split('<h2>Chores and verbs</h2>')[0]),
      at: now - 4 * 24 * 60 * MIN,
      device: ru.revisions.thisDevice,
      kind: 'saved',
    },
  ];

  const defaultMessages: DocChatMessage[] = [
    { id: 'seed-u', role: 'user', text: 'Is my guess about “laver le carrelage” right?', passage: { text: GUESS_SENTENCE, blockLabel: SECTION }, targetId: 'seed-u' },
    tutor('seed-u-r', 'seed-u', { blocks: tutorScripts.guess.blocks, suggestion: tutorScripts.guess.suggestion }),
  ];

  const vocabUser: DocChatMessage = { id: 'voc-u', role: 'user', text: VOCAB_PROMPT, targetId: 'voc-u' };
  const vocabReply = buildReply(VOCAB_PROMPT, undefined, undefined);

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
    flags: defaultFlags,
    messages: defaultMessages,
    references: [copiedReferences[0]],
    revisions,
    pendingPassage: TARGET_SENTENCE,
    seedTargets: [{ messageId: 'seed-u', sentence: GUESS_SENTENCE }],
    reviewId: null,
    inlineReviewId: null,
    recovery: 'recovered',
    nodes: savedNodes,
    blocksKey: savedKey,
    blockCount: savedNodes.length - 1,
    selectedBlockId: null,
    editorBlockId: null,
    proposalReviewId: null,
    learnerPreview: false,
    viewer: 'author',
    updatedSinceCompletion: false,
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
        nodes: [proseNode],
        blocksKey: serializeBlocks([proseNode]),
        blockCount: 0,
      };
    case 'vocab-request':
      return { ...quiet, messages: [vocabUser, tutor('voc-u-r', 'voc-u', vocabReply, 'queued')] };
    case 'proposal-ready':
      return { ...quiet, messages: [vocabUser, tutor('voc-u-r', 'voc-u', vocabReply)] };
    case 'proposal-review':
      return { ...quiet, messages: [vocabUser, tutor('voc-u-r', 'voc-u', vocabReply)], proposalReviewId: 'voc-u-r' };
    case 'proposal-stale': {
      // The tutor prepared an updated version of "Chores from class"; the author has edited it since.
      const edited = { ...savedVocabularyBlock, entries: [...savedVocabularyBlock.entries, { id: 'v-lessive', term: 'lessive', translation: 'стирка' }] };
      const updated = {
        ...savedVocabularyBlock,
        entries: savedVocabularyBlock.entries.map((e) => (e.id === 'v-balai' ? { ...e, exampleTranslation: 'Веник стоит за дверью кухни.' } : e)),
      };
      const nodes: SheetNode[] = [proseNode, blockNode(edited), blockNode(savedExercisesBlock)];
      return {
        ...quiet,
        nodes,
        blocksKey: serializeBlocks(nodes),
        messages: [
          { id: 'st-u', role: 'user', text: 'Add the missing example translation to “Chores from class”', targetId: 'st-u' },
          tutor('st-u-r', 'st-u', {
            blocks: [{ type: 'p', text: 'I added a Russian translation for the “balai” example. Nothing else in the block changes.' }],
            proposal: { label: 'Vocabulary', blocks: [updated], updatesBlockId: savedVocabularyBlock.id, basedOnKey: blockKey(savedVocabularyBlock) },
          }),
        ],
      };
    }
    case 'block-selected':
      return { ...quiet, selectedBlockId: savedVocabularyBlock.id };
    case 'block-editor':
      return { ...quiet, selectedBlockId: savedVocabularyBlock.id, editorBlockId: savedVocabularyBlock.id };
    case 'exercise-editor':
      return { ...quiet, selectedBlockId: savedExercisesBlock.id, editorBlockId: savedExercisesBlock.id };
    case 'learner-preview':
      return { ...quiet, learnerPreview: true };
    case 'grammar-editor':
      return { ...quiet, selectedBlockId: grammarBlock.id, editorBlockId: grammarBlock.id };
    case 'bilingual-editor':
      return { ...quiet, selectedBlockId: bilingualBlock.id, editorBlockId: bilingualBlock.id };
    case 'audio-editor':
      return { ...quiet, selectedBlockId: audioBlock.id, editorBlockId: audioBlock.id };
    case 'video-editor':
      return { ...quiet, selectedBlockId: videoBlock.id, editorBlockId: videoBlock.id };
    case 'video-unavailable': {
      const nodes = savedNodes.map((n) => (n.kind === 'block' && n.id === videoBlock.id ? blockNode({ ...videoBlock, unavailable: true }) : n));
      return { ...quiet, nodes, blocksKey: serializeBlocks(nodes) };
    }
    case 'reader-signed-in':
      return { ...quiet, viewer: 'reader' };
    case 'reader-anonymous':
      return { ...quiet, viewer: 'anonymous' };
    case 'reader-updated':
      return { ...quiet, viewer: 'reader', updatedSinceCompletion: true };
    case 'reader-revoked':
      return { ...quiet, viewer: 'revoked' };
    case 'mobile-reader':
      return { ...quiet, viewer: 'reader' };
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
          { id: 'fix-u', role: 'user', text: ru.actionPrompts.correct, passage: { text: CHECK_SENTENCE, blockLabel: CHECK_SECTION }, action: 'correct', targetId: 'fix-u' },
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
        seedTargets: [...base.seedTargets, { messageId: 'prop-u', sentence: TARGET_SENTENCE, changeTo: { find: 'cleaning the tiles', replace: 'washing the kitchen floor' } }],
        inlineReviewId: 'prop-u-r',
      };
    }
    case 'proposal':
      return {
        ...quiet,
        messages: [
          ...defaultMessages,
          { id: 'prop-u', role: 'user', text: 'Why does “faire le carrelage” sound wrong?', passage: { text: TARGET_SENTENCE, blockLabel: SECTION }, targetId: 'prop-u' },
          tutor('prop-u-r', 'prop-u', { blocks: tutorScripts.tiles.blocks, suggestion: tutorScripts.tiles.suggestion }),
        ],
        seedTargets: [...base.seedTargets, { messageId: 'prop-u', sentence: TARGET_SENTENCE }],
        reviewId: 'prop-u-r',
      };
    case 'streaming':
      return {
        ...quiet,
        messages: [...defaultMessages, { id: 'str-u', role: 'user', text: 'Give me examples with laver', targetId: 'str-u' }, tutor('str-u-r', 'str-u', tutorScripts.practice, 'queued')],
      };
    case 'stopped':
      return {
        ...quiet,
        messages: [
          ...defaultMessages,
          { id: 'stp-u', role: 'user', text: 'Explain the difference between faire and laver simply', targetId: 'stp-u' },
          tutor('stp-u-r', 'stp-u', tutorScripts.contrast, 'stopped', 70),
        ],
      };
    case 'limits':
      return { ...base, flags: { ...base.flags, lowLimits: true }, references: [copiedReferences[0]] };
    case 'conflict':
      return { ...quiet, conflict: { device: ru.revisions.phone, at: now - 3 * MIN, title: DOC_TITLE, html: normalizeHtml(otherDeviceHtml) } };
    case 'history':
      return { ...quiet, historyOpen: true };
    case 'loading':
      return { ...base, loadStatus: 'loading' };
    case 'load-error':
      return { ...base, loadStatus: 'error' };
    case 'mobile-doc':
      return { ...quiet, mobileTab: 'doc' };
    case 'mobile-tutor':
      return { ...quiet, mobileTab: 'tutor', messages: [vocabUser, tutor('voc-u-r', 'voc-u', vocabReply)] };
    case 'mobile-editor':
      return { ...quiet, mobileTab: 'doc', selectedBlockId: savedVocabularyBlock.id, editorBlockId: savedVocabularyBlock.id };
    default:
      return base;
  }
}

