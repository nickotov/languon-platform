import type {
    CreateKnowledgeNoteRequest,
    DeleteKnowledgeNoteRequest,
    KnowledgeNote,
    KnowledgeNoteRevision,
    ListKnowledgeQuery,
    RestoreKnowledgeNoteRequest,
    UpdateKnowledgeNoteRequest,
} from '@languon/contracts';

export interface KnowledgeStore {
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
