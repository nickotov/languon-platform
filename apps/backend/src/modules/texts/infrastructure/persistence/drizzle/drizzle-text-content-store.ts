import type {
    CreateTextFolderRequest,
    CreateTextRequest,
    MoveTextRequest,
    SaveTextRequest,
    UpdateTextFolderRequest,
} from '@languon/contracts';
import type { DictionaryCryptography } from '../../../../dictionaries/application/ports/dictionary-cryptography';
import type {
    TextContentStore,
    TextPage,
    TextShareAccess,
} from '../../../application/ports/text-content-store';
import { getText, listFolders, listTexts } from './text-content-access';
import {
    createFolder,
    createText,
    folderLifecycle,
    moveText,
    pendingJob,
    saveText,
    textLifecycle,
    updateFolder,
} from './text-content-mutations';
import type {
    TextContentContext,
    TextProposalLoader,
} from './text-content-persistence-support';
import {
    copyShared,
    issueShare,
    readShared,
    revokeShare,
} from './text-content-sharing';
import { type TextsContentDatabase } from './text-content-support';
export class DrizzleTextContentStore implements TextContentStore {
    constructor(
        private readonly db: TextsContentDatabase,
        private readonly ids: { generate(): string },
        private readonly clock: { now(): Date },
        private readonly crypto: DictionaryCryptography,
        private readonly proposal?: TextProposalLoader,
    ) {}

    private createPersistenceContext(): TextContentContext {
        return {
            db: this.db,
            ids: this.ids,
            clock: this.clock,
            crypto: this.crypto,
            proposal: this.proposal,
        };
    }

    async listFolders(ownerId: string, page: TextPage) {
        return listFolders(this.createPersistenceContext(), ownerId, page);
    }

    async createFolder(ownerId: string, request: CreateTextFolderRequest) {
        return createFolder(this.createPersistenceContext(), ownerId, request);
    }

    async updateFolder(
        ownerId: string,
        id: string,
        request: UpdateTextFolderRequest,
    ) {
        return updateFolder(
            this.createPersistenceContext(),
            ownerId,
            id,
            request,
        );
    }

    async folderLifecycle(
        ownerId: string,
        id: string,
        expectedVersion: number,
        lifecycle: 'active' | 'archived',
    ) {
        return folderLifecycle(
            this.createPersistenceContext(),
            ownerId,
            id,
            expectedVersion,
            lifecycle,
        );
    }

    async listTexts(ownerId: string, folderId: string | null, page: TextPage) {
        return listTexts(
            this.createPersistenceContext(),
            ownerId,
            folderId,
            page,
        );
    }

    async pendingJob(ownerId: string, id: string) {
        return pendingJob(this.createPersistenceContext(), ownerId, id);
    }

    async moveText(ownerId: string, id: string, request: MoveTextRequest) {
        return moveText(this.createPersistenceContext(), ownerId, id, request);
    }

    async createText(ownerId: string, request: CreateTextRequest) {
        return createText(this.createPersistenceContext(), ownerId, request);
    }

    async getText(ownerId: string, id: string) {
        return getText(this.createPersistenceContext(), ownerId, id);
    }

    async saveText(ownerId: string, id: string, request: SaveTextRequest) {
        return saveText(this.createPersistenceContext(), ownerId, id, request);
    }

    async textLifecycle(
        ownerId: string,
        id: string,
        expectedVersion: number,
        lifecycle: 'active' | 'archived',
    ) {
        return textLifecycle(
            this.createPersistenceContext(),
            ownerId,
            id,
            expectedVersion,
            lifecycle,
        );
    }

    async issueShare(
        ownerId: string,
        kind: 'text' | 'folder',
        id: string,
        expectedVersion: number,
    ) {
        return issueShare(
            this.createPersistenceContext(),
            ownerId,
            kind,
            id,
            expectedVersion,
        );
    }

    async revokeShare(
        ownerId: string,
        kind: 'text' | 'folder',
        id: string,
        expectedVersion: number,
    ) {
        return revokeShare(
            this.createPersistenceContext(),
            ownerId,
            kind,
            id,
            expectedVersion,
        );
    }

    async readShared(access: TextShareAccess, page: TextPage) {
        return readShared(this.createPersistenceContext(), access, page);
    }

    async copyShared(
        ownerId: string,
        access: TextShareAccess,
        request: {
            destinationFolderId?: string | null;
            sharedFolderConfirmation?: {
                shareId: string;
                shareVersion: number;
            };
            newFolderName?: string;
            sourceTextId?: string;
            name?: string;
            idempotencyKey: string;
            expectedVersion?: number;
        },
    ) {
        return copyShared(
            this.createPersistenceContext(),
            ownerId,
            access,
            request,
        );
    }
}
export type {
    TextProposalLoader,
    TextProposalSaveInput,
} from './text-content-persistence-support';
