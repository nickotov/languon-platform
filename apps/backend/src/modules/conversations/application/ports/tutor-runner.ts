import type {
    ChatPreferences,
    KnowledgeNoteContent,
    ConversationToolCall,
    ConversationEditorTarget,
} from '@languon/contracts';

/** Application-owned persistence boundary. Implementations fence every write to the claimed turn. */
export interface TutorMemoryMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
    attachments?: TutorContextMaterial[];
    /** Private model parts on the canonical message row; never returned directly to a client. */
    modelContent?: Record<string, unknown>;
    editorTarget?: ConversationEditorTarget;
}

export interface TutorMemoryPort {
    listMessages(input: {
        ids?: string[];
        after?: string;
        before?: string;
        offset: number;
        limit: number;
        order: 'asc' | 'desc';
    }): Promise<{ messages: TutorMemoryMessage[]; total: number }>;
    /** Idempotent merges preserve previously stored original text and ownership. */
    saveMessages(messages: TutorMemoryMessage[]): Promise<void>;
    readState(key: string): Promise<Record<string, unknown> | null>;
    /** The supplied entries are written atomically under the operation fence. */
    writeState(entries: Record<string, Record<string, unknown>>): Promise<void>;
}

export type TutorCallPurpose = 'answer' | 'observation' | 'reflection';

export interface TutorCallAdmission {
    callId: string;
    purpose: TutorCallPurpose;
    inputTokenEstimate: number;
    maxOutputTokens: number;
    /** Actual provider finish reason, retained even when numerical usage is unavailable. */
    outputLimitReached?: boolean;
    /** Positive provider finish witness; refusals and unknown/error finishes are false. */
    providerCompleted?: boolean;
}

export interface TutorCallUsage {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    outputLimitReached?: boolean;
}

/** Durable accounting surrounds every actual provider dispatch, including memory processing. */
export interface TutorAccountingPort {
    admit(
        call: TutorCallAdmission,
    ): Promise<void | { maxOutputTokens: number }>;
    settle(call: TutorCallAdmission, usage: TutorCallUsage): Promise<void>;
    /** Missing usage is unknown, never a fabricated zero. Must retain the admitted liability. */
    fail(
        call: TutorCallAdmission,
        reason: 'provider-error' | 'missing-usage' | 'aborted',
        usage?: TutorCallUsage,
    ): Promise<void>;
}

export interface TutorContextMaterial {
    id: string;
    label: string;
    content: string;
}

export interface TutorRunInput {
    conversationId: string;
    ownerId: string;
    operationId: string;
    conversationCreatedAt: string;
    message: TutorMemoryMessage;
    preferences: ChatPreferences;
    /** Authorized, bounded source metadata/current text. No share secrets or source instructions. */
    sourceContext: Record<string, unknown>;
    /** Ephemeral approved data, never persisted as a message or memory state. */
    portraitContext?: unknown;
    memory: TutorMemoryPort;
    signal: AbortSignal;
    onDelta(input: { messageId: string; text: string }): Promise<void>;
    onTool?(call: ConversationToolCall): Promise<void>;
    onDraft(content: KnowledgeNoteContent): Promise<{ id: string }>;
    readContext(input: {
        query: string;
        limit: number;
    }): Promise<{ material: TutorContextMaterial[]; total: number }>;
}

export interface TutorRunner {
    run(input: TutorRunInput): Promise<{ text: string }>;
}
