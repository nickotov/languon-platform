import type { AppUiState, Autoplay } from '../types/app';
import type { Conversation, KnowledgeDraft, TutorState } from '../types/tutor';
import {
  DICT_SOURCE_ID,
  SEED_NOTE_ID,
  TEXT_SOURCE_ID,
  cardAttachment,
  createSeedNote,
  nuancesDictionary,
  noteSourceId,
} from '../data/sources';
import { DEFAULT_MODEL } from '../data/models';
import {
  createAssistant,
  createConversation,
  createUser,
  defaultPrefs,
  specFor,
  uid,
} from './tutorReducer';
import { draftFromResponse } from './responseBuilder';

const MIN = 60 * 1000;

function doneConversation(
  base: TutorState,
  sourceId: string,
  question: string,
  attachments: ReturnType<typeof cardAttachment>[] | Conversation['composer']['attachments'],
  now: number,
  ago: number,
): Conversation {
  const user = createUser(question, attachments);
  const spec = specFor(base, sourceId, user);
  const answer = createAssistant(spec, { model: DEFAULT_MODEL, now, userMsgId: user.id, done: true });
  return createConversation(sourceId, defaultPrefs, now - ago, {
    title: question,
    messages: [user, answer],
  });
}

const cafeQuote = (text: string, paragraph: number) => ({
  id: uid('q'),
  kind: 'quote' as const,
  label: `“${text.slice(0, 26)}…”`,
  text,
  origin: `Un café à Paris · paragraph ${paragraph}`,
  external: false,
});

export function buildScenario(id: string, now: number): { tutor: TutorState; ui: AppUiState; autoplay: Autoplay } {
  const seedNote = createSeedNote(now);
  const base: TutorState = {
    conversations: [],
    activeId: '',
    drafts: {},
    notes: { [SEED_NOTE_ID]: seedNote },
    streaming: null,
    folded: false,
    unread: false,
    interrupted: false,
    view: 'chat',
    editorDraftId: null,
    credits: 184,
    model: DEFAULT_MODEL,
    unavailableModels: ['Qwen Reader'],
    alert: null,
    defaults: defaultPrefs,
    pendingSourceUpdates: [],
    flags: {
      failNextSave: false,
      failNextStream: false,
      reconnectNextStream: false,
      noteConflict: false,
      inaccessibleSources: [],
    },
    scrollToken: 0,
  };

  const cards = nuancesDictionary.cards;
  const c1 = doneConversation(
    base,
    TEXT_SOURCE_ID,
    'Why is the subjunctive used here?',
    [cafeQuote("Bien qu'il fasse froid, la terrasse est déjà pleine", 1)],
    now,
    12 * MIN,
  );
  const c2 = doneConversation(base, TEXT_SOURCE_ID, 'Explain the tone of this passage.', [], now, 2 * 24 * 60 * MIN);
  const c3 = doneConversation(
    base,
    DICT_SOURCE_ID,
    'Compare these two expressions.',
    [cardAttachment(cards[0]), cardAttachment(cards[1])],
    now,
    26 * 60 * MIN,
  );

  const ui: AppUiState = {
    page: TEXT_SOURCE_ID,
    sidebarCollapsed: false,
    dock: 'right',
    wide: false,
    widgetHeight: null,
    sheet: 'partial',
    selectMode: false,
    keyboardOpen: false,
    hasUnsavedEdits: false,
    showTranslation: false,
  };
  const autoplay: Autoplay = {};
  let state: TutorState = { ...base, conversations: [c2, c3, c1], activeId: c1.id };

  const withNew = (sourceId: string, partial: Partial<Conversation>) => {
    const conv = createConversation(sourceId, defaultPrefs, now, partial);
    state = { ...state, conversations: [...state.conversations, conv], activeId: conv.id };
    return conv;
  };

  const addDraft = (conv: Conversation, mode: 'new' | 'update', status: KnowledgeDraft['status']) => {
    const lastAnswer = [...conv.messages].reverse().find((m) => m.role === 'assistant');
    const responseKey = lastAnswer && lastAnswer.role === 'assistant' ? lastAnswer.responseKey : 'subjunctive';
    const note = mode === 'update' ? state.notes[SEED_NOTE_ID] : undefined;
    const tpl = draftFromResponse(responseKey, mode, note);
    const draftSpec = specFor(state, conv.sourceId, createUser('', []));
    const draftMsg = createAssistant(
      { ...draftSpec, key: 'draft', blocks: [{ type: 'p', text: 'I’ve prepared a draft from this explanation. Review it before saving — nothing is added to Knowledge until you press **Save**.' }], activities: [{ running: 'Preparing a Knowledge draft…', done: 'Prepared a Knowledge draft' }], materials: [], materialsLabel: '', usage: { credits: 2, inputTokens: 1620, outputTokens: 240 } },
      { model: DEFAULT_MODEL, now, userMsgId: '', kind: 'draft', done: true },
    );
    const draft: KnowledgeDraft = {
      id: uid('d'),
      conversationId: conv.id,
      mode,
      targetNoteId: mode === 'update' ? SEED_NOTE_ID : undefined,
      ...tpl,
      studiedLanguage: 'French',
      explanationLanguage: 'English',
      status,
      localSavedAt: now - 40 * 1000,
      conflict: false,
      creditsUsed: 2,
    };
    state = {
      ...state,
      drafts: { ...state.drafts, [draft.id]: draft },
      conversations: state.conversations.map((c) =>
        c.id === conv.id
          ? { ...c, messages: [...c.messages, draftMsg, { id: uid('m'), role: 'draft' as const, draftId: draft.id }] }
          : c,
      ),
      view: 'editor',
      editorDraftId: draft.id,
    };
    return draft;
  };

  switch (id) {
    case 'dock-left':
      ui.dock = 'left';
      break;
    case 'dock-left-collapsed':
      ui.dock = 'left';
      ui.sidebarCollapsed = true;
      break;
    case 'folded-responding':
      state = updateComposer(state, c1.id, 'Can you give me more examples with « bien que »?');
      autoplay.send = true;
      autoplay.foldAfterMs = 1600;
      break;
    case 'selection':
      withNew(TEXT_SOURCE_ID, {
        composer: {
          text: 'Why is « pourtant » placed in the middle here?',
          attachments: [cafeQuote('Le serveur, pourtant pressé, prend le temps de sourire', 2)],
          useDraftSource: false,
        },
      });
      autoplay.focusComposer = true;
      break;
    case 'streaming':
      withNew(TEXT_SOURCE_ID, {
        composer: {
          text: 'Explain when to use the imparfait vs the passé composé, using this text.',
          attachments: [],
          useDraftSource: false,
        },
      });
      ui.wide = true;
      autoplay.send = true;
      break;
    case 'dictionary':
      ui.page = DICT_SOURCE_ID;
      withNew(DICT_SOURCE_ID, {
        composer: {
          text: 'Compare these three — when would I use each?',
          attachments: [cardAttachment(cards[0]), cardAttachment(cards[1]), cardAttachment(cards[2])],
          useDraftSource: false,
        },
      });
      autoplay.send = true;
      break;
    case 'prefs-history':
      state = {
        ...state,
        view: 'history',
        conversations: state.conversations.map((c) =>
          c.id === c1.id ? { ...c, prefs: { ...c.prefs, tone: 'Conversational', level: 'Beginner-friendly' } } : c,
        ),
      };
      break;
    case 'knowledge-draft':
      addDraft(c1, 'new', 'editing');
      break;
    case 'error-save':
      addDraft(c1, 'new', 'failed');
      break;
    case 'note-conflict': {
      ui.page = noteSourceId(SEED_NOTE_ID);
      const conv = doneConversation(state, noteSourceId(SEED_NOTE_ID), 'Is there a common mistake I should add?', [], now, 4 * MIN);
      state = { ...state, conversations: [...state.conversations, conv], activeId: conv.id };
      addDraft(conv, 'update', 'editing');
      const draftId = state.editorDraftId as string;
      state = {
        ...state,
        flags: { ...state.flags, noteConflict: true },
        drafts: { ...state.drafts, [draftId]: { ...state.drafts[draftId], conflict: true } },
        notes: {
          ...state.notes,
          [SEED_NOTE_ID]: {
            ...seedNote,
            summary: `${seedNote.summary} Quoique follows the same rule.`,
            body: `${seedNote.body}\n- Added on your phone: *quoique* works the same way.`,
            updatedAt: now - 2 * MIN,
            lastEdit: 'Edited on your phone 2 minutes ago',
          },
        },
      };
      break;
    }
    case 'mobile-collapsed':
      ui.sheet = 'partial';
      state = { ...state, folded: true };
      break;
    case 'mobile-partial':
      ui.sheet = 'partial';
      break;
    case 'mobile-full':
      ui.sheet = 'full';
      break;
    case 'mobile-keyboard':
      ui.sheet = 'full';
      ui.keyboardOpen = true;
      state = updateComposer(state, c1.id, 'Does quoique work the same way');
      autoplay.focusComposer = true;
      break;
    case 'error-reconnect':
      withNew(TEXT_SOURCE_ID, {
        composer: { text: 'Explain the tone of this passage.', attachments: [], useDraftSource: false },
      });
      state = { ...state, flags: { ...state.flags, reconnectNextStream: true } };
      autoplay.send = true;
      break;
    case 'error-incomplete': {
      const conv = doneConversation(state, TEXT_SOURCE_ID, 'Explain the imparfait vs passé composé in this text.', [], now, 3 * MIN);
      const msgs = conv.messages.map((m) =>
        m.role === 'assistant'
          ? { ...m, revealed: Math.floor(m.total * 0.4), status: 'failed' as const, failReason: 'connection' as const }
          : m,
      );
      state = { ...state, conversations: [...state.conversations, { ...conv, messages: msgs }], activeId: conv.id };
      break;
    }
    case 'error-credits':
      state = { ...updateComposer(state, c1.id, 'Can you quiz me on this?'), credits: 0, alert: 'credits' };
      break;
    case 'error-model':
      state = { ...updateComposer(state, c1.id, 'Give me three more examples.'), model: 'Qwen Reader', alert: 'model' };
      break;
    case 'error-source':
      state = { ...state, flags: { ...state.flags, inaccessibleSources: [TEXT_SOURCE_ID] } };
      break;
    default:
      break;
  }

  return { tutor: state, ui, autoplay };
}

function updateComposer(state: TutorState, convId: string, text: string): TutorState {
  return {
    ...state,
    conversations: state.conversations.map((c) =>
      c.id === convId ? { ...c, composer: { ...c.composer, text } } : c,
    ),
  };
}

