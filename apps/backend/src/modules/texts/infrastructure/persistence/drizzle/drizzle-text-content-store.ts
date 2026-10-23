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
import { type TextProposalLoader } from './text-content-persistence-support';
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

    async listFolders(ownerId: string, page: TextPage) {
        return listFolders(
            {
                db: this.db,
                ids: this.ids,
                clock: this.clock,
                crypto: this.crypto,
                proposal: this.proposal,
            },
            ownerId,
            page,
        );
    }

    async createFolder(ownerId: string, request: CreateTextFolderRequest) {
        return createFolder(
            {
                db: this.db,
                ids: this.ids,
                clock: this.clock,
                crypto: this.crypto,
                proposal: this.proposal,
            },
            ownerId,
            request,
        );
    }

    async updateFolder(
        ownerId: string,
        id: string,
        request: UpdateTextFolderRequest,
    ) {
        return updateFolder(
            {
                db: this.db,
                ids: this.ids,
                clock: this.clock,
                crypto: this.crypto,
                proposal: this.proposal,
            },
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
            {
                db: this.db,
                ids: this.ids,
                clock: this.clock,
                crypto: this.crypto,
                proposal: this.proposal,
            },
            ownerId,
            id,
            expectedVersion,
            lifecycle,
        );
    }

    async listTexts(ownerId: string, folderId: string | null, page: TextPage) {
        return listTexts(
            {
                db: this.db,
                ids: this.ids,
                clock: this.clock,
                crypto: this.crypto,
                proposal: this.proposal,
            },
            ownerId,
            folderId,
            page,
        );
    }

    async pendingJob(ownerId: string, id: string) {
        return pendingJob(
            {
                db: this.db,
                ids: this.ids,
                clock: this.clock,
                crypto: this.crypto,
                proposal: this.proposal,
            },
            ownerId,
            id,
        );
    }

    async moveText(ownerId: string, id: string, request: MoveTextRequest) {
        return moveText(
            {
                db: this.db,
                ids: this.ids,
                clock: this.clock,
                crypto: this.crypto,
                proposal: this.proposal,
            },
            ownerId,
            id,
            request,
        );
    }

    async createText(ownerId: string, request: CreateTextRequest) {
        return createText(
            {
                db: this.db,
                ids: this.ids,
                clock: this.clock,
                crypto: this.crypto,
                proposal: this.proposal,
            },
            ownerId,
            request,
        );
    }

    async getText(ownerId: string, id: string) {
        return getText(
            {
                db: this.db,
                ids: this.ids,
                clock: this.clock,
                crypto: this.crypto,
                proposal: this.proposal,
            },
            ownerId,
            id,
        );
    }

    async saveText(ownerId: string, id: string, request: SaveTextRequest) {
        return saveText(
            {
                db: this.db,
                ids: this.ids,
                clock: this.clock,
                crypto: this.crypto,
                proposal: this.proposal,
            },
            ownerId,
            id,
            request,
        );
    }

    async textLifecycle(
        ownerId: string,
        id: string,
        expectedVersion: number,
        lifecycle: 'active' | 'archived',
    ) {
        return textLifecycle(
            {
                db: this.db,
                ids: this.ids,
                clock: this.clock,
                crypto: this.crypto,
                proposal: this.proposal,
            },
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
            {
                db: this.db,
                ids: this.ids,
                clock: this.clock,
                crypto: this.crypto,
                proposal: this.proposal,
            },
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
            {
                db: this.db,
                ids: this.ids,
                clock: this.clock,
                crypto: this.crypto,
                proposal: this.proposal,
            },
            ownerId,
            kind,
            id,
            expectedVersion,
        );
    }

    async readShared(access: TextShareAccess, page: TextPage) {
        return readShared(
            {
                db: this.db,
                ids: this.ids,
                clock: this.clock,
                crypto: this.crypto,
                proposal: this.proposal,
            },
            access,
            page,
        );
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
            {
                db: this.db,
                ids: this.ids,
                clock: this.clock,
                crypto: this.crypto,
                proposal: this.proposal,
            },
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
