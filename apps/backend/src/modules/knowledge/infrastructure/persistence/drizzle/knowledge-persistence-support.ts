import type { KnowledgeShareCrypto } from '../../knowledge-share-crypto';
import {
    type KnowledgeDatabase,
    type KnowledgeTransaction,
} from './knowledge-transaction';

export interface KnowledgeLifecycleParticipant {
    /** Remove/fence source-bound conversations in this transaction; reject unsettled work safely. */
    beforeNoteDeletion(
        tx: KnowledgeTransaction,
        input: { ownerId: string; noteId: string; now: Date },
    ): Promise<void>;
}

export interface KnowledgeStoreContext {
    readonly database: KnowledgeDatabase;
    readonly lifecycle: KnowledgeLifecycleParticipant;
    readonly shareCrypto: KnowledgeShareCrypto;
    readonly limits: { referenceChars: number; editorChars: number };
}
