import {
    ChatPreferencesSchema,
    type ConversationSource,
    type KnowledgeNote,
    type KnowledgeNoteContent,
} from '@languon/contracts';
import { type ConversationPortraitPolicy } from '../../../application/portrait-context';
import { type WorkspaceContextLimits } from '../../../application/workspace-turn-context';
import { ConversationError } from '../../../domain/conversation';
import type {
    ConversationSourceResolver,
    ConversationsDatabase,
    ConversationsTransaction,
} from './conversation-source';
import type {
    conversationsTable as chats,
    conversationDraftsTable as drafts,
    conversationMessagesTable as messages,
    conversationTurnsTable as turns,
} from './schema';

export type ChatRow = typeof chats.$inferSelect;

export type TurnRow = typeof turns.$inferSelect;

export type MessageRow = typeof messages.$inferSelect;

export type DraftRow = typeof drafts.$inferSelect;

export const chatView = (r: ChatRow) => ({
    id: r.id,
    title: r.title,
    source: r.source,
    preferences: ChatPreferencesSchema.parse(r.preferences),
    version: r.version,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
});

/** Learner projection deliberately has no access to private execution metadata. */
type PublicTurnRow = Pick<
    TurnRow,
    | 'id'
    | 'conversationId'
    | 'status'
    | 'failureCode'
    | 'usage'
    | 'billing'
    | 'createdAt'
    | 'updatedAt'
>;
export const turnView = (r: PublicTurnRow) => ({
    id: r.id,
    conversationId: r.conversationId,
    status: r.status,
    failureCode: r.failureCode,
    usage: {
        inputTokens: r.usage.inputTokens,
        outputTokens: r.usage.outputTokens,
        chargedCredits: r.usage.chargedCredits,
        estimated: r.usage.estimated,
    },
    outputLimitReached: r.usage.outputLimitReached ?? false,
    ...(r.billing ? { billing: r.billing } : {}),
    modelId: null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
});

export const messageView = (r: MessageRow) => ({
    id: r.id,
    conversationId: r.conversationId,
    turnId: r.turnId,
    role: r.role,
    content: r.content,
    attachments: r.attachments,
    ...(r.editorTarget ? { editorTarget: r.editorTarget } : {}),
    toolCalls: r.toolCalls,
    status: r.status,
    sourceVersion: r.sourceVersion,
    sourceProvenance: r.sourceProvenance,
    createdAt: r.createdAt.toISOString(),
});

export const draftView = (r: DraftRow) => ({
    id: r.id,
    conversationId: r.conversationId,
    version: r.version,
    targetNoteId: r.targetNoteId,
    expectedNoteVersion: r.expectedNoteVersion,
    content: r.content,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
});

export const conflict = (message: string) =>
    new ConversationError('version_conflict', message);

export const sameConversationSourceRevision = (
    kind: ConversationSource['kind'],
    prepared: string,
    current: string,
) =>
    kind === 'dictionary'
        ? prepared.split(':').slice(0, 2).join(':') ===
          current.split(':').slice(0, 2).join(':')
        : prepared === current;

export interface ConversationPersistenceDependencies {
    database: ConversationsDatabase;
    readPortrait?: (
        tx: ConversationsTransaction,
        ownerId: string,
    ) => Promise<ConversationPortraitPolicy>;
    sources: ConversationSourceResolver;
    workspaceContextLimits?: WorkspaceContextLimits;
    nameUntitledNote?: (
        tx: ConversationsTransaction,
        ownerId: string,
        noteId: string,
        title: string,
    ) => Promise<void>;
    now?: () => Date;
    admitTurn: ((
        tx: ConversationsTransaction,
        input: {
            ownerId: string;
            turnId: string;
            conversationId: string;
            requestId?: string;
            fingerprint?: string;
            confirmedQuoteId?: string;
            inputTokenBound?: number;
            reserveToolContinuation?: boolean;
        },
    ) => Promise<Record<string, unknown>>) & {
        prepare?: (tx: ConversationsTransaction) => Promise<void>;
    };
    publishNote: (
        tx: ConversationsTransaction,
        ownerId: string,
        input: {
            operationId: string;
            content: KnowledgeNoteContent;
            noteId?: string;
            expectedVersion?: number;
        },
    ) => Promise<KnowledgeNote>;
    settleInterrupted?: (
        tx: ConversationsTransaction,
        turn: TurnRow,
    ) => Promise<void>;
}

export interface ConversationPersistenceContext {
    dependencies: ConversationPersistenceDependencies;
    now: () => Date;
}
