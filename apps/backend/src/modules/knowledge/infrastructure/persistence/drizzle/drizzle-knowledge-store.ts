import {
    type CreateKnowledgeNoteRequest,
    type DeleteKnowledgeNoteRequest,
    type KnowledgeWorkingContent,
    type ListKnowledgeQuery,
    type RestoreKnowledgeNoteRequest,
    type UpdateKnowledgeNoteRequest,
} from '@languon/contracts';
import type { KnowledgeStore } from '../../../application/knowledge-store';
import type { KnowledgeShareCrypto } from '../../knowledge-share-crypto';
import {
    create,
    deleteNote,
    get,
    list,
    restore,
    revisions,
    update,
} from './knowledge-note-operations';
import { type KnowledgeLifecycleParticipant } from './knowledge-persistence-support';
import {
    copyShared,
    getShare,
    issueShare,
    readShared,
    revokeShare,
} from './knowledge-share-operations';
import { type KnowledgeDatabase } from './knowledge-transaction';
import {
    resolveWorking,
    saveWorkspace,
    saveWorkspaceCopy,
    updateWorking,
} from './knowledge-working-content';
import {
    createDraft,
    getWorkspace,
    listWorkspaces,
} from './knowledge-workspace-access';
export class DrizzleKnowledgeStore implements KnowledgeStore {
    constructor(
        private readonly database: KnowledgeDatabase,
        private readonly lifecycle: KnowledgeLifecycleParticipant,
        private readonly shareCrypto: KnowledgeShareCrypto,
        private readonly limits = {
            referenceChars: 40_000,
            editorChars: 40_000,
        },
    ) {}

    list(ownerId: string, query: ListKnowledgeQuery) {
        return list(
            {
                database: this.database,
                lifecycle: this.lifecycle,
                shareCrypto: this.shareCrypto,
                limits: this.limits,
            },
            ownerId,
            query,
        );
    }

    get(ownerId: string, noteId: string) {
        return get(
            {
                database: this.database,
                lifecycle: this.lifecycle,
                shareCrypto: this.shareCrypto,
                limits: this.limits,
            },
            ownerId,
            noteId,
        );
    }

    create(ownerId: string, input: CreateKnowledgeNoteRequest) {
        return create(
            {
                database: this.database,
                lifecycle: this.lifecycle,
                shareCrypto: this.shareCrypto,
                limits: this.limits,
            },
            ownerId,
            input,
        );
    }

    update(ownerId: string, noteId: string, input: UpdateKnowledgeNoteRequest) {
        return update(
            {
                database: this.database,
                lifecycle: this.lifecycle,
                shareCrypto: this.shareCrypto,
                limits: this.limits,
            },
            ownerId,
            noteId,
            input,
        );
    }

    revisions(ownerId: string, noteId: string) {
        return revisions(
            {
                database: this.database,
                lifecycle: this.lifecycle,
                shareCrypto: this.shareCrypto,
                limits: this.limits,
            },
            ownerId,
            noteId,
        );
    }

    restore(
        ownerId: string,
        noteId: string,
        input: RestoreKnowledgeNoteRequest,
    ) {
        return restore(
            {
                database: this.database,
                lifecycle: this.lifecycle,
                shareCrypto: this.shareCrypto,
                limits: this.limits,
            },
            ownerId,
            noteId,
            input,
        );
    }

    async delete(
        ownerId: string,
        noteId: string,
        input: DeleteKnowledgeNoteRequest,
    ): Promise<void> {
        return deleteNote(
            {
                database: this.database,
                lifecycle: this.lifecycle,
                shareCrypto: this.shareCrypto,
                limits: this.limits,
            },
            ownerId,
            noteId,
            input,
        );
    }

    async getWorkspace(ownerId: string, noteId: string) {
        return getWorkspace(
            {
                database: this.database,
                lifecycle: this.lifecycle,
                shareCrypto: this.shareCrypto,
                limits: this.limits,
            },
            ownerId,
            noteId,
        );
    }

    async listWorkspaces(ownerId: string, query: ListKnowledgeQuery) {
        return listWorkspaces(
            {
                database: this.database,
                lifecycle: this.lifecycle,
                shareCrypto: this.shareCrypto,
                limits: this.limits,
            },
            ownerId,
            query,
        );
    }

    async createDraft(ownerId: string, input: { operationId: string }) {
        return createDraft(
            {
                database: this.database,
                lifecycle: this.lifecycle,
                shareCrypto: this.shareCrypto,
                limits: this.limits,
            },
            ownerId,
            input,
        );
    }

    async updateWorking(
        ownerId: string,
        noteId: string,
        input: {
            operationId: string;
            branchId: string;
            expectedVersion: number;
            content: KnowledgeWorkingContent;
        },
    ) {
        return updateWorking(
            {
                database: this.database,
                lifecycle: this.lifecycle,
                shareCrypto: this.shareCrypto,
                limits: this.limits,
            },
            ownerId,
            noteId,
            input,
        );
    }

    async resolveWorking(
        ownerId: string,
        noteId: string,
        input: {
            operationId: string;
            keepBranchId: string;
            keepVersion: number;
            discardBranches: { id: string; expectedVersion: number }[];
        },
    ) {
        return resolveWorking(
            {
                database: this.database,
                lifecycle: this.lifecycle,
                shareCrypto: this.shareCrypto,
                limits: this.limits,
            },
            ownerId,
            noteId,
            input,
        );
    }

    async saveWorkspace(
        ownerId: string,
        noteId: string,
        input: {
            operationId: string;
            branchId: string;
            expectedVersion: number;
            expectedPublishedVersion: number;
        },
    ) {
        return saveWorkspace(
            {
                database: this.database,
                lifecycle: this.lifecycle,
                shareCrypto: this.shareCrypto,
                limits: this.limits,
            },
            ownerId,
            noteId,
            input,
        );
    }

    async saveWorkspaceCopy(
        ownerId: string,
        noteId: string,
        input: {
            operationId: string;
            branchId: string;
            expectedVersion: number;
        },
    ) {
        return saveWorkspaceCopy(
            {
                database: this.database,
                lifecycle: this.lifecycle,
                shareCrypto: this.shareCrypto,
                limits: this.limits,
            },
            ownerId,
            noteId,
            input,
        );
    }

    async getShare(ownerId: string, noteId: string) {
        return getShare(
            {
                database: this.database,
                lifecycle: this.lifecycle,
                shareCrypto: this.shareCrypto,
                limits: this.limits,
            },
            ownerId,
            noteId,
        );
    }

    async issueShare(ownerId: string, noteId: string) {
        return issueShare(
            {
                database: this.database,
                lifecycle: this.lifecycle,
                shareCrypto: this.shareCrypto,
                limits: this.limits,
            },
            ownerId,
            noteId,
        );
    }

    async revokeShare(ownerId: string, noteId: string) {
        return revokeShare(
            {
                database: this.database,
                lifecycle: this.lifecycle,
                shareCrypto: this.shareCrypto,
                limits: this.limits,
            },
            ownerId,
            noteId,
        );
    }

    async readShared(locator: string, key: string) {
        return readShared(
            {
                database: this.database,
                lifecycle: this.lifecycle,
                shareCrypto: this.shareCrypto,
                limits: this.limits,
            },
            locator,
            key,
        );
    }

    async copyShared(
        ownerId: string,
        locator: string,
        key: string,
        input: { operationId: string; expectedVersion: number },
    ) {
        return copyShared(
            {
                database: this.database,
                lifecycle: this.lifecycle,
                shareCrypto: this.shareCrypto,
                limits: this.limits,
            },
            ownerId,
            locator,
            key,
            input,
        );
    }
}
export type { KnowledgeLifecycleParticipant } from './knowledge-persistence-support';
