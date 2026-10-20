import type {
    CreateKnowledgeNoteRequest,
    DeleteKnowledgeNoteRequest,
    KnowledgeNote,
    KnowledgeNoteRevision,
    ListKnowledgeQuery,
    RestoreKnowledgeNoteRequest,
    UpdateKnowledgeNoteRequest,
    KnowledgeWorkspace,
    KnowledgeWorkingBranch,
    KnowledgeWorkingContent,
} from '@languon/contracts';

export interface KnowledgeStore {
    listWorkspaces(
        ownerId: string,
        query: ListKnowledgeQuery,
    ): Promise<{
        workspaces: {
            id: string;
            title: string;
            status: 'draft' | 'saved';
            hasUnsavedChanges: boolean;
            updatedAt: string;
        }[];
        total: number;
        offset: number;
        limit: number;
    }>;
    getWorkspace(ownerId: string, noteId: string): Promise<KnowledgeWorkspace>;
    createDraft(
        ownerId: string,
        input: { operationId: string },
    ): Promise<KnowledgeWorkspace>;
    updateWorking(
        ownerId: string,
        noteId: string,
        input: {
            operationId: string;
            branchId: string;
            expectedVersion: number;
            content: KnowledgeWorkingContent;
        },
    ): Promise<{
        branch: KnowledgeWorkingBranch;
        conflict: boolean;
        branches: KnowledgeWorkingBranch[];
    }>;
    resolveWorking(
        ownerId: string,
        noteId: string,
        input: {
            operationId: string;
            keepBranchId: string;
            keepVersion: number;
            discardBranches: { id: string; expectedVersion: number }[];
        },
    ): Promise<KnowledgeWorkspace>;
    saveWorkspace(
        ownerId: string,
        noteId: string,
        input: {
            operationId: string;
            branchId: string;
            expectedVersion: number;
            expectedPublishedVersion: number;
        },
    ): Promise<KnowledgeNote>;
    saveWorkspaceCopy(
        ownerId: string,
        noteId: string,
        input: {
            operationId: string;
            branchId: string;
            expectedVersion: number;
        },
    ): Promise<KnowledgeNote>;
    getShare(
        ownerId: string,
        noteId: string,
    ): Promise<{ locator: string; key: string }>;
    issueShare(
        ownerId: string,
        noteId: string,
    ): Promise<{ locator: string; key: string }>;
    revokeShare(ownerId: string, noteId: string): Promise<{ disabled: true }>;
    readShared(locator: string, key: string): Promise<KnowledgeNote>;
    copyShared(
        ownerId: string,
        locator: string,
        key: string,
        input: { operationId: string; expectedVersion: number },
    ): Promise<KnowledgeNote>;
    list(
        ownerId: string,
        query: ListKnowledgeQuery,
    ): Promise<{
        notes: KnowledgeNote[];
        total: number;
        offset: number;
        limit: number;
    }>;
    get(ownerId: string, noteId: string): Promise<KnowledgeNote>;
    create(
        ownerId: string,
        input: CreateKnowledgeNoteRequest,
    ): Promise<KnowledgeNote>;
    update(
        ownerId: string,
        noteId: string,
        input: UpdateKnowledgeNoteRequest,
    ): Promise<KnowledgeNote>;
    delete(
        ownerId: string,
        noteId: string,
        input: DeleteKnowledgeNoteRequest,
    ): Promise<void>;
    revisions(
        ownerId: string,
        noteId: string,
    ): Promise<KnowledgeNoteRevision[]>;
    restore(
        ownerId: string,
        noteId: string,
        input: RestoreKnowledgeNoteRequest,
    ): Promise<KnowledgeNote>;
}
