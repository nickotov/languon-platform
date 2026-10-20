import type {
  AssistantMsg,
  Attachment,
  ComposerState,
  Conversation,
  DraftOrigin,
  KnowledgeDraft,
  Message,
  Prefs,
  TutorFlags,
  TutorState,
  UserMsg,
  WidgetView,
} from '../types/tutor';
import { getSourceInfo } from '../data/sources';
import { buildResponse, draftFromResponse, noteMaterial, pickResponseKey } from './responseBuilder';
import type { ResponseSpec } from './responseBuilder';
import { blocksLength, chunkEnd } from './richText';

export const ATTACHMENT_LIMIT = 4;

let counter = 0;
export const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export const defaultPrefs: Prefs = {
  replyLanguage: 'Automatic',
  tone: 'Neutral',
  level: 'Automatic',
};

export const emptyComposer = (): ComposerState => ({
  text: '',
  attachments: [],
  useDraftSource: false,
});

export function createConversation(
  sourceId: string,
  prefs: Prefs,
  now: number,
  partial: Partial<Conversation> = {},
): Conversation {
  return {
    id: uid('c'),
    sourceId,
    title: 'New conversation',
    messages: [],
    prefs,
    updatedAt: now,
    composer: emptyComposer(),
    mismatchDismissed: false,
    ...partial,
  };
}

interface AssistantOptions {
  model: string;
  now: number;
  userMsgId: string;
  kind?: 'answer' | 'draft';
  done?: boolean;
  failAt?: number;
  reconnectAt?: number;
  draftOf?: DraftOrigin;
}

export function createAssistant(spec: ResponseSpec, o: AssistantOptions): AssistantMsg {
  const total = blocksLength(spec.blocks);
  return {
    id: uid('a'),
    role: 'assistant',
    kind: o.kind ?? 'answer',
    responseKey: spec.key,
    blocks: spec.blocks,
    total,
    revealed: o.done ? total : 0,
    status: o.done ? 'done' : 'preparing',
    activities: spec.activities,
    activityIndex: o.done ? spec.activities.length : 0,
    materials: spec.materials,
    materialsLabel: spec.materialsLabel,
    usage: spec.usage,
    model: o.model,
    nextAt: o.now + 900,
    failAt: o.failAt,
    reconnectAt: o.reconnectAt,
    userMsgId: o.userMsgId,
    draftOf: o.draftOf,
  };
}

export function createUser(text: string, attachments: Attachment[], draftContent = false): UserMsg {
  return { id: uid('u'), role: 'user', text, attachments, draftContent };
}

export function specFor(state: TutorState, sourceId: string, user: UserMsg): ResponseSpec {
  const source = getSourceInfo(sourceId, state.notes);
  const key = pickResponseKey(user.text, user.attachments, source.kind);
  const spec = buildResponse(key, user.attachments);
  if (source.kind === 'note') {
    const note = state.notes[sourceId.replace('note:', '')];
    if (note) return { ...spec, materials: [noteMaterial(note)] };
  }
  return spec;
}

export type TutorAction =
  | { type: 'tick'; now: number }
  | { type: 'send'; now: number; draftSource: boolean }
  | { type: 'stop' }
  | { type: 'retry'; messageId: string; now: number }
  | { type: 'composer'; patch: Partial<ComposerState> }
  | { type: 'addAttachment'; attachment: Attachment }
  | { type: 'removeAttachment'; id: string }
  | { type: 'prefs'; patch: Partial<Prefs> }
  | { type: 'saveDefaults' }
  | { type: 'newConversation'; sourceId: string; now: number }
  | { type: 'openForSource'; sourceId: string; now: number }
  | { type: 'switchConversation'; id: string }
  | { type: 'deleteConversation'; id: string; fallbackSourceId: string; now: number }
  | { type: 'pageChanged'; sourceId: string; now: number }
  | { type: 'dismissMismatch' }
  | { type: 'fold' }
  | { type: 'expand' }
  | { type: 'view'; view: WidgetView }
  | { type: 'createDraft'; messageId: string; mode: 'new' | 'update'; now: number }
  | { type: 'openEditor'; draftId: string }
  | { type: 'updateDraft'; id: string; patch: Partial<KnowledgeDraft>; now: number }
  | { type: 'discardDraft'; id: string }
  | { type: 'restoreDraft'; id: string }
  | { type: 'saveDraftStart'; id: string }
  | { type: 'saveDraftFinish'; id: string; now: number }
  | { type: 'saveDraftAsNew'; id: string }
  | { type: 'setModel'; model: string }
  | { type: 'dismissAlert' }
  | { type: 'sourceUpdated'; sourceId: string }
  | { type: 'flags'; patch: Partial<TutorFlags> };

function activeConv(state: TutorState): Conversation {
  return state.conversations.find((c) => c.id === state.activeId) ?? state.conversations[0];
}

function updateConv(
  state: TutorState,
  id: string,
  fn: (c: Conversation) => Conversation,
): TutorState {
  return { ...state, conversations: state.conversations.map((c) => (c.id === id ? fn(c) : c)) };
}

function mostRecentFor(list: Conversation[], sourceId: string): Conversation | undefined {
  return list
    .filter((c) => c.sourceId === sourceId)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
}

function isBlank(c: Conversation): boolean {
  return c.messages.length === 0 && !c.composer.text.trim() && c.composer.attachments.length === 0;
}

function deriveTitle(text: string, attachments: Attachment[]): string {
  const base = text.trim() || `About ${attachments.map((a) => a.label).join(', ')}`;
  return base.length > 52 ? `${base.slice(0, 50).trim()}…` : base;
}

function blockedReason(state: TutorState): TutorState['alert'] {
  if (state.credits < 1) return 'credits';
  if (state.unavailableModels.includes(state.model)) return 'model';
  return null;
}

function finishStream(state: TutorState, conv: Conversation, next: AssistantMsg, now: number): TutorState {
  let messages: Message[] = conv.messages.map((m) => (m.id === next.id ? next : m));
  const finished = next.status === 'done' || next.status === 'failed';
  if (!finished) {
    return updateConv(state, conv.id, (c) => ({ ...c, messages }));
  }
  let drafts = state.drafts;
  let notes = state.notes;
  if (next.status === 'done' && next.kind === 'draft' && next.draftOf) {
    const origin = next.draftOf;
    const note = origin.targetNoteId ? notes[origin.targetNoteId] : undefined;
    const tpl = draftFromResponse(origin.responseKey, origin.mode, note);
    const draft: KnowledgeDraft = {
      id: uid('d'),
      conversationId: conv.id,
      mode: origin.mode,
      targetNoteId: origin.mode === 'update' ? origin.targetNoteId : undefined,
      ...tpl,
      studiedLanguage: 'French',
      explanationLanguage: 'English',
      status: 'editing',
      localSavedAt: now,
      conflict: false,
      creditsUsed: next.usage.credits,
    };
    if (origin.mode === 'update' && note && state.flags.noteConflict) {
      draft.conflict = true;
      notes = {
        ...notes,
        [note.id]: {
          ...note,
          summary: `${note.summary} Quoique follows the same rule.`,
          body: `${note.body}\n- Added on your phone: *quoique* works the same way.`,
          updatedAt: now - 2 * 60 * 1000,
          lastEdit: 'Edited on your phone 2 minutes ago',
        },
      };
    }
    drafts = { ...drafts, [draft.id]: draft };
    messages = [...messages, { id: uid('m'), role: 'draft', draftId: draft.id }];
  }
  const charged = next.status === 'done' ? next.usage.credits : 0;
  return {
    ...updateConv(state, conv.id, (c) => ({ ...c, messages, updatedAt: now })),
    drafts,
    notes,
    streaming: null,
    credits: Math.max(0, state.credits - charged),
    unread: state.folded && next.status === 'done' ? true : state.unread,
    interrupted: state.folded && next.status === 'failed' ? true : state.interrupted,
  };
}

function tick(state: TutorState, now: number): TutorState {
  const s = state.streaming;
  if (!s) return state;
  const conv = state.conversations.find((c) => c.id === s.conversationId);
  const msg = conv?.messages.find((m) => m.id === s.messageId) as AssistantMsg | undefined;
  if (!conv || !msg) return { ...state, streaming: null };
  let next: AssistantMsg;
  switch (msg.status) {
    case 'preparing':
      if (now < msg.nextAt) return state;
      next = msg.activities.length
        ? { ...msg, status: 'working', activityIndex: 0, nextAt: now + 1200 }
        : { ...msg, status: 'streaming' };
      break;
    case 'working': {
      if (now < msg.nextAt) return state;
      const idx = msg.activityIndex + 1;
      next =
        idx >= msg.activities.length
          ? { ...msg, activityIndex: idx, status: 'streaming' }
          : { ...msg, activityIndex: idx, nextAt: now + 1100 };
      break;
    }
    case 'reconnecting':
      if (now < msg.nextAt) return state;
      next = { ...msg, status: 'streaming', reconnected: true };
      break;
    case 'streaming': {
      const end = chunkEnd(msg.blocks, msg.revealed);
      if (msg.failAt !== undefined && end >= msg.failAt) {
        next = { ...msg, revealed: msg.failAt, status: 'failed', failReason: 'connection' };
      } else if (msg.reconnectAt !== undefined && !msg.reconnected && end >= msg.reconnectAt) {
        next = { ...msg, revealed: msg.reconnectAt, status: 'reconnecting', nextAt: now + 2800 };
      } else if (end >= msg.total) {
        next = { ...msg, revealed: msg.total, status: 'done' };
      } else {
        next = { ...msg, revealed: end };
      }
      break;
    }
    default:
      return { ...state, streaming: null };
  }
  return finishStream(state, conv, next, now);
}

function startAnswer(state: TutorState, conv: Conversation, user: UserMsg, now: number, extra: Message[]): TutorState {
  const spec = specFor(state, conv.sourceId, user);
  const total = blocksLength(spec.blocks);
  const assistant = createAssistant(spec, {
    model: state.model,
    now,
    userMsgId: user.id,
    failAt: state.flags.failNextStream ? Math.floor(total * 0.42) : undefined,
    reconnectAt: state.flags.reconnectNextStream ? Math.floor(total * 0.3) : undefined,
  });
  return {
    ...updateConv(state, conv.id, (c) => ({
      ...c,
      messages: [...c.messages, ...extra, assistant],
      updatedAt: now,
    })),
    streaming: { conversationId: conv.id, messageId: assistant.id },
    flags: { ...state.flags, failNextStream: false, reconnectNextStream: false },
    unread: false,
    interrupted: false,
    alert: null,
    scrollToken: state.scrollToken + 1,
  };
}

export function tutorReducer(state: TutorState, action: TutorAction): TutorState {
  const conv = activeConv(state);
  switch (action.type) {
    case 'tick':
      return tick(state, action.now);

    case 'send': {
      const text = conv.composer.text.trim();
      const attachments = conv.composer.attachments;
      if (state.streaming || (!text && attachments.length === 0)) return state;
      const blocked = blockedReason(state);
      if (blocked) return { ...state, alert: blocked };
      const extra: Message[] = [];
      const pending = state.pendingSourceUpdates.includes(conv.sourceId);
      if (pending && conv.messages.length) extra.push({ id: uid('m'), role: 'divider', label: 'Source updated' });
      const user = createUser(text, attachments, action.draftSource && conv.composer.useDraftSource);
      extra.push(user);
      const withTitle = updateConv(state, conv.id, (c) => ({
        ...c,
        title: c.messages.length === 0 ? deriveTitle(text, attachments) : c.title,
        composer: { ...emptyComposer(), useDraftSource: c.composer.useDraftSource },
      }));
      const next = startAnswer(withTitle, activeConv(withTitle), user, action.now, extra);
      return {
        ...next,
        pendingSourceUpdates: next.pendingSourceUpdates.filter((s) => s !== conv.sourceId),
      };
    }

    case 'stop': {
      const s = state.streaming;
      if (!s) return state;
      return {
        ...updateConv(state, s.conversationId, (c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.id === s.messageId && m.role === 'assistant'
              ? { ...m, status: 'stopped', failReason: 'stopped' }
              : m,
          ),
        })),
        streaming: null,
      };
    }

    case 'retry': {
      if (state.streaming) return state;
      const failed = conv.messages.find((m) => m.id === action.messageId) as AssistantMsg | undefined;
      const user = conv.messages.find((m) => failed && m.id === failed.userMsgId) as UserMsg | undefined;
      if (!failed || !user) return state;
      const blocked = blockedReason(state);
      if (blocked) return { ...state, alert: blocked };
      return startAnswer(state, conv, user, action.now, []);
    }

    case 'composer':
      return updateConv(state, conv.id, (c) => ({ ...c, composer: { ...c.composer, ...action.patch } }));

    case 'addAttachment': {
      const list = conv.composer.attachments;
      if (list.some((a) => a.id === action.attachment.id) || list.length >= ATTACHMENT_LIMIT) return state;
      return updateConv(state, conv.id, (c) => ({
        ...c,
        composer: { ...c.composer, attachments: [...list, action.attachment] },
      }));
    }

    case 'removeAttachment':
      return updateConv(state, conv.id, (c) => ({
        ...c,
        composer: { ...c.composer, attachments: c.composer.attachments.filter((a) => a.id !== action.id) },
      }));

    case 'prefs':
      return updateConv(state, conv.id, (c) => ({ ...c, prefs: { ...c.prefs, ...action.patch } }));

    case 'saveDefaults':
      return { ...state, defaults: { ...conv.prefs } };

    case 'newConversation': {
      if (isBlank(conv) && conv.sourceId === action.sourceId) return { ...state, view: 'chat' };
      const others = isBlank(conv) ? state.conversations.filter((c) => c.id !== conv.id) : state.conversations;
      const fresh = createConversation(action.sourceId, state.defaults, action.now);
      return { ...state, conversations: [...others, fresh], activeId: fresh.id, view: 'chat', alert: null };
    }

    case 'openForSource': {
      const base = { ...state, folded: false, unread: false, interrupted: false, view: 'chat' as const };
      if (conv.sourceId === action.sourceId) return base;
      const others = isBlank(conv) ? state.conversations.filter((c) => c.id !== conv.id) : state.conversations;
      const recent = mostRecentFor(others, action.sourceId);
      if (recent) return { ...base, conversations: others, activeId: recent.id };
      const fresh = createConversation(action.sourceId, state.defaults, action.now);
      return { ...base, conversations: [...others, fresh], activeId: fresh.id };
    }

    case 'switchConversation':
      return { ...state, activeId: action.id, view: 'chat', alert: null };

    case 'deleteConversation': {
      const target = state.conversations.find((c) => c.id === action.id);
      if (!target) return state;
      const streaming = state.streaming?.conversationId === action.id ? null : state.streaming;
      const rest = state.conversations.filter((c) => c.id !== action.id);
      if (state.activeId !== action.id) return { ...state, conversations: rest, streaming };
      const recent = mostRecentFor(rest, action.fallbackSourceId);
      if (recent) return { ...state, conversations: rest, activeId: recent.id, streaming, view: 'chat' };
      const fresh = createConversation(action.fallbackSourceId, state.defaults, action.now);
      return { ...state, conversations: [...rest, fresh], activeId: fresh.id, streaming, view: 'chat' };
    }

    case 'pageChanged': {
      if (conv.sourceId === action.sourceId) return state;
      if (isBlank(conv)) {
        const others = state.conversations.filter((c) => c.id !== conv.id);
        const recent = mostRecentFor(others, action.sourceId);
        if (recent) return { ...state, conversations: others, activeId: recent.id };
        const fresh = createConversation(action.sourceId, state.defaults, action.now);
        return { ...state, conversations: [...others, fresh], activeId: fresh.id };
      }
      return updateConv(state, conv.id, (c) => ({ ...c, mismatchDismissed: false }));
    }

    case 'dismissMismatch':
      return updateConv(state, conv.id, (c) => ({ ...c, mismatchDismissed: true }));

    case 'fold':
      return { ...state, folded: true };

    case 'expand':
      return { ...state, folded: false, unread: false, interrupted: false };

    case 'view':
      return { ...state, view: action.view };

    case 'createDraft': {
      if (state.streaming) return state;
      const src = conv.messages.find((m) => m.id === action.messageId) as AssistantMsg | undefined;
      if (!src) return state;
      const blocked = blockedReason(state);
      if (blocked) return { ...state, alert: blocked };
      const spec = buildResponse('draft', []);
      const targetNoteId = conv.sourceId.startsWith('note:') ? conv.sourceId.replace('note:', '') : undefined;
      const msg = createAssistant(spec, {
        model: state.model,
        now: action.now,
        userMsgId: src.userMsgId,
        kind: 'draft',
        draftOf: { responseKey: src.responseKey, mode: action.mode, targetNoteId },
      });
      return {
        ...updateConv(state, conv.id, (c) => ({ ...c, messages: [...c.messages, msg] })),
        streaming: { conversationId: conv.id, messageId: msg.id },
        scrollToken: state.scrollToken + 1,
      };
    }

    case 'openEditor':
      return { ...state, view: 'editor', editorDraftId: action.draftId };

    case 'updateDraft': {
      const d = state.drafts[action.id];
      if (!d) return state;
      const status = d.status === 'failed' || d.status === 'saved' ? 'editing' : d.status;
      return {
        ...state,
        drafts: { ...state.drafts, [d.id]: { ...d, ...action.patch, status, localSavedAt: action.now } },
      };
    }

    case 'discardDraft':
    case 'restoreDraft': {
      const d = state.drafts[action.id];
      if (!d) return state;
      const status = action.type === 'discardDraft' ? 'discarded' : 'editing';
      return {
        ...state,
        drafts: { ...state.drafts, [d.id]: { ...d, status } },
        view: action.type === 'discardDraft' && state.editorDraftId === d.id ? 'chat' : state.view,
      };
    }

    case 'saveDraftStart': {
      const d = state.drafts[action.id];
      if (!d) return state;
      return { ...state, drafts: { ...state.drafts, [d.id]: { ...d, status: 'saving' } } };
    }

    case 'saveDraftFinish': {
      const d = state.drafts[action.id];
      if (!d) return state;
      if (state.flags.failNextSave) {
        return {
          ...state,
          drafts: { ...state.drafts, [d.id]: { ...d, status: 'failed' } },
          flags: { ...state.flags, failNextSave: false },
        };
      }
      const noteId = d.mode === 'update' && d.targetNoteId ? d.targetNoteId : uid('n');
      const note = {
        id: noteId,
        title: d.title,
        summary: d.summary,
        body: d.body,
        studiedLanguage: d.studiedLanguage,
        explanationLanguage: d.explanationLanguage,
        categories: d.categories,
        updatedAt: action.now,
      };
      return {
        ...state,
        notes: { ...state.notes, [noteId]: note },
        drafts: { ...state.drafts, [d.id]: { ...d, status: 'saved', savedNoteId: noteId } },
      };
    }

    case 'saveDraftAsNew': {
      const d = state.drafts[action.id];
      if (!d) return state;
      return {
        ...state,
        drafts: { ...state.drafts, [d.id]: { ...d, mode: 'new', targetNoteId: undefined, conflict: false } },
      };
    }

    case 'setModel':
      return {
        ...state,
        model: action.model,
        alert: state.alert === 'model' && !state.unavailableModels.includes(action.model) ? null : state.alert,
      };

    case 'dismissAlert':
      return { ...state, alert: null };

    case 'sourceUpdated':
      return state.pendingSourceUpdates.includes(action.sourceId)
        ? state
        : { ...state, pendingSourceUpdates: [...state.pendingSourceUpdates, action.sourceId] };

    case 'flags':
      return { ...state, flags: { ...state.flags, ...action.patch } };
  }
}

