import type {
    CreateTextFolderRequest,
    UpdateTextFolderRequest,
    CreateTextRequest,
    SaveTextRequest,
    MoveTextRequest,
    TextFolder,
    TextDocument,
    TextAiJob,
} from '@languon/contracts';
export interface TextPage {
    limit: number;
    cursor?: string;
    lifecycle?: 'active' | 'archived';
}
export interface TextShareAccess {
    kind: 'text' | 'folder';
    locator: string;
    key: string;
}
export interface TextSourceAuthority {
    actorId: string;
    textId: string;
    version: number;
    share?: { id: string; keyDigest: string; version: number };
}
export interface TextContentStore {
    listFolders(
        ownerId: string,
        page: TextPage,
    ): Promise<{ items: TextFolder[]; nextCursor: string | null }>;
    createFolder(
        ownerId: string,
        request: CreateTextFolderRequest,
    ): Promise<TextFolder>;
    updateFolder(
        ownerId: string,
        id: string,
        request: UpdateTextFolderRequest,
    ): Promise<TextFolder>;
    folderLifecycle(
        ownerId: string,
        id: string,
        expectedVersion: number,
        lifecycle: 'active' | 'archived',
    ): Promise<TextFolder>;
    listTexts(
        ownerId: string,
        folderId: string | null,
        page: TextPage,
    ): Promise<{ items: TextDocument[]; nextCursor: string | null }>;
    pendingJob(ownerId: string, id: string): Promise<TextAiJob | null>;
    moveText(
        ownerId: string,
        id: string,
        request: MoveTextRequest,
    ): Promise<TextDocument>;
    createText(
        ownerId: string,
        request: CreateTextRequest,
    ): Promise<TextDocument>;
    getText(ownerId: string, id: string): Promise<TextDocument>;
    saveText(
        ownerId: string,
        id: string,
        request: SaveTextRequest,
    ): Promise<TextDocument>;
    textLifecycle(
        ownerId: string,
        id: string,
        expectedVersion: number,
        lifecycle: 'active' | 'archived',
    ): Promise<TextDocument>;
    issueShare(
        ownerId: string,
        kind: 'text' | 'folder',
        id: string,
        expectedVersion: number,
    ): Promise<{ locator: string; key: string; version: number }>;
    revokeShare(
        ownerId: string,
        kind: 'text' | 'folder',
        id: string,
        expectedVersion: number,
    ): Promise<void>;
    readShared(
        access: TextShareAccess,
        page: TextPage,
    ): Promise<{
        folder: TextFolder | null;
        texts: TextDocument[];
        nextCursor: string | null;
    }>;
    copyShared(
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
    ): Promise<{ id: string }>;
}
