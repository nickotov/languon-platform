import type {
    AdminSentenceDictionaryQuery,
    AdminSentenceDictionaryResponse,
    SentenceLibraryQuery,
    SentenceLibraryListResponse,
    SentenceLibraryDetail,
    SentenceLibrarySnapshotRequest,
    SentenceLibrarySnapshotResponse,
    SentenceLibraryMutationRequest,
    SentenceLibraryMutationResponse,
    AdminSentenceLibraryListResponse,
    AdminSentenceLibraryDetail,
    AdminSentenceLibraryQuery,
    AdminSentenceLibrarySnapshotRequest,
    AdminSentenceLibraryMutationRequest,
} from '@languon/contracts';
import type { LearningAccess } from './learning-store';
import type { SentenceContext } from './sentence-practice-store';
export interface SentenceLibraryAdminScope {
    actorId: string;
    actorSessionId: string;
    targetUserId: string;
    dictionaryId: string;
    audit: { id: string; correlationId: string; expiresAt: Date };
}
export type SentenceLibraryAdminDiscoveryScope = Omit<
    SentenceLibraryAdminScope,
    'dictionaryId'
> & { dictionaryId?: never };
export class SentenceLibraryDeletionBusyError extends Error {}
export interface SentenceLibraryStore {
    adminDictionaries(
        scope: SentenceLibraryAdminDiscoveryScope,
        query: AdminSentenceDictionaryQuery,
        context: SentenceContext,
    ): Promise<AdminSentenceDictionaryResponse>;
    list(
        access: LearningAccess,
        query: SentenceLibraryQuery,
        context: SentenceContext,
    ): Promise<SentenceLibraryListResponse>;
    detail(
        access: LearningAccess,
        exerciseId: string,
        context: SentenceContext,
    ): Promise<SentenceLibraryDetail>;
    snapshot(
        access: LearningAccess,
        input: SentenceLibrarySnapshotRequest,
        context: SentenceContext,
    ): Promise<SentenceLibrarySnapshotResponse>;
    mutate(
        access: LearningAccess,
        input: SentenceLibraryMutationRequest,
        context: SentenceContext,
    ): Promise<SentenceLibraryMutationResponse>;
    adminList(
        scope: SentenceLibraryAdminScope,
        query: AdminSentenceLibraryQuery,
        context: SentenceContext,
    ): Promise<AdminSentenceLibraryListResponse>;
    adminDetail(
        scope: SentenceLibraryAdminScope,
        exerciseId: string,
        context: SentenceContext,
    ): Promise<AdminSentenceLibraryDetail>;
    adminSnapshot(
        scope: SentenceLibraryAdminScope,
        input: AdminSentenceLibrarySnapshotRequest,
        context: SentenceContext,
    ): Promise<SentenceLibrarySnapshotResponse>;
    adminMutate(
        scope: SentenceLibraryAdminScope,
        input: AdminSentenceLibraryMutationRequest,
        context: SentenceContext,
    ): Promise<SentenceLibraryMutationResponse>;
}
