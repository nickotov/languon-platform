import type {
    AdminSentenceDictionaryQuery,
    AdminSentenceLibraryMutationRequest,
    AdminSentenceLibraryQuery,
    AdminSentenceLibrarySnapshotRequest,
    SentenceLibraryMutationRequest,
    SentenceLibraryQuery,
    SentenceLibrarySnapshotRequest,
} from '@languon/contracts';
import {
    AdminSentenceLibraryDetailSchema,
    AdminSentenceLibraryListResponseSchema,
} from '@languon/contracts';
import type { LearningAccess } from '../../../application/ports/learning-store';
import {
    type SentenceLibraryAdminDiscoveryScope,
    type SentenceLibraryAdminScope,
    type SentenceLibraryStore,
} from '../../../application/ports/sentence-library-store';
import type { SentenceContext } from '../../../application/ports/sentence-practice-store';
import { sentenceLibraryMutateInternal } from './sentence-library-mutations';
import type { SentenceLibraryAdminHooks } from './sentence-library-projection';
import { type SentenceLibraryPersistenceContext } from './sentence-library-projection';
import {
    sentenceLibraryAdminDictionaries,
    sentenceLibraryDetailInternal,
    sentenceLibraryListInternal,
} from './sentence-library-queries';
import { sentenceLibrarySnapshotInternal } from './sentence-library-snapshots';
import { type SentenceDatabase } from './sentence-persistence-support';

export {
    pruneSentenceLibrarySnapshots,
    type SentenceLibraryAdminHooks,
} from './sentence-library-projection';

export class DrizzleSentenceLibraryStore implements SentenceLibraryStore {
    private readonly persistence: SentenceLibraryPersistenceContext;

    constructor(
        database: SentenceDatabase,
        adminHooks?: SentenceLibraryAdminHooks,
    ) {
        this.persistence = { database, adminHooks };
    }

    async adminDictionaries(
        scope: SentenceLibraryAdminDiscoveryScope,
        query: AdminSentenceDictionaryQuery,
        context: SentenceContext,
    ) {
        return sentenceLibraryAdminDictionaries(
            this.persistence,
            scope,
            query,
            context,
        );
    }

    list(a: LearningAccess, q: SentenceLibraryQuery, c: SentenceContext) {
        return sentenceLibraryListInternal(this.persistence, a, q, c);
    }

    detail(a: LearningAccess, id: string, c: SentenceContext) {
        return sentenceLibraryDetailInternal(this.persistence, a, id, c);
    }

    snapshot(
        a: LearningAccess,
        i: SentenceLibrarySnapshotRequest,
        c: SentenceContext,
    ) {
        return sentenceLibrarySnapshotInternal(this.persistence, a, i, c);
    }

    mutate(
        a: LearningAccess,
        i: SentenceLibraryMutationRequest,
        c: SentenceContext,
    ) {
        return sentenceLibraryMutateInternal(this.persistence, a, i, c);
    }

    adminList(
        a: SentenceLibraryAdminScope,
        q: AdminSentenceLibraryQuery,
        c: SentenceContext,
    ) {
        return sentenceLibraryListInternal(this.persistence, a, q, c).then(
            (result) => AdminSentenceLibraryListResponseSchema.parse(result),
        );
    }

    adminDetail(a: SentenceLibraryAdminScope, id: string, c: SentenceContext) {
        return sentenceLibraryDetailInternal(this.persistence, a, id, c).then(
            (result) => AdminSentenceLibraryDetailSchema.parse(result),
        );
    }

    adminSnapshot(
        a: SentenceLibraryAdminScope,
        i: AdminSentenceLibrarySnapshotRequest,
        c: SentenceContext,
    ) {
        return sentenceLibrarySnapshotInternal(this.persistence, a, i, c);
    }

    adminMutate(
        a: SentenceLibraryAdminScope,
        i: AdminSentenceLibraryMutationRequest,
        c: SentenceContext,
    ) {
        return sentenceLibraryMutateInternal(this.persistence, a, i, c);
    }
}
