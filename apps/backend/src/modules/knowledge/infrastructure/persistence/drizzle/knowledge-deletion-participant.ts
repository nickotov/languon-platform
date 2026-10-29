import { knowledgeSentenceJobSourcesTable } from './knowledge-sentence-job-source-schema';
import { eraseKnowledgeSentenceJobs } from './knowledge-sentence-cleanup';
import { knowledgePrivateTranslationsTable } from './private-translation-schema';
import { eraseKnowledgeTranslationJobs } from './private-translation-lifecycle';
import {
    knowledgeVocabularyPreferencesTable,
    knowledgeVocabularyAttemptsTable,
    knowledgeVocabularyProgressTable,
} from './vocabulary-practice-schema';
import {
    knowledgeSentenceExercisesTable,
    knowledgeSentenceAttemptsTable,
    knowledgeSentenceReviewsTable,
    knowledgeSentenceExposuresTable,
} from './knowledge-sentence-schema';
import { eq, sql } from 'drizzle-orm';
import { knowledgeNotesTable, knowledgeOperationReceiptsTable } from './schema';
import type { KnowledgeTransaction } from './knowledge-transaction';
import { knowledgeWorkbooksTable } from './workbook-schema';
import { deleteUnreferencedKnowledgeMedia } from './media-grants';
import { eraseKnowledgeSpeech } from '../../../../speech/infrastructure/knowledge-speech-lifecycle';
import {
    knowledgeLearnerAttemptsTable,
    knowledgeLearnerEventsTable,
    knowledgeLearnerCompletionTable,
    knowledgeLearnerCompletionReceiptsTable,
} from './learner-schema';

/** Call after conversation cancellation/accounting quiescence and conversation-memory erasure.
 * Revision rows cascade; numeric external AI accounting is owned by its ledger. */
export async function eraseOwnerKnowledge(
    tx: KnowledgeTransaction,
    ownerId: string,
    authorization?: { workerId: string; fencingToken: number },
): Promise<void> {
    if (authorization) {
        await tx.execute(
            sql`select languon_purge_knowledge_owner(${ownerId}::uuid,${authorization.workerId},${authorization.fencingToken}::integer)`,
        );

        return;
    }

    for (const table of [
        knowledgePrivateTranslationsTable,
        knowledgeVocabularyPreferencesTable,
        knowledgeVocabularyProgressTable,
        knowledgeVocabularyAttemptsTable,
        knowledgeSentenceReviewsTable,
        knowledgeSentenceAttemptsTable,
        knowledgeSentenceExposuresTable,
        knowledgeSentenceExercisesTable,
        knowledgeLearnerAttemptsTable,
        knowledgeLearnerEventsTable,
        knowledgeLearnerCompletionTable,
        knowledgeLearnerCompletionReceiptsTable,
    ])
        await tx.delete(table).where(eq(table.actorId, ownerId));
    const notes = await tx
        .select({ id: knowledgeNotesTable.id })
        .from(knowledgeNotesTable)
        .where(eq(knowledgeNotesTable.ownerId, ownerId));

    for (const note of notes) {
        await eraseKnowledgeSentenceJobs(tx, note.id, new Date());
        await eraseKnowledgeSpeech(tx, note.id);
        await eraseKnowledgeTranslationJobs(tx, note.id, new Date());
    }

    await tx
        .delete(knowledgeWorkbooksTable)
        .where(eq(knowledgeWorkbooksTable.ownerId, ownerId));

    await tx
        .delete(knowledgeNotesTable)
        .where(eq(knowledgeNotesTable.ownerId, ownerId));

    await tx
        .delete(knowledgeSentenceJobSourcesTable)
        .where(eq(knowledgeSentenceJobSourcesTable.actorId, ownerId));

    await deleteUnreferencedKnowledgeMedia(tx);

    await tx
        .delete(knowledgeOperationReceiptsTable)
        .where(eq(knowledgeOperationReceiptsTable.ownerId, ownerId));
}

export async function hasOwnerKnowledge(
    tx: KnowledgeTransaction,
    ownerId: string,
): Promise<boolean> {
    const rows = await tx.execute(
        sql`select 1 from knowledge_sentence_job_sources where actor_id=${ownerId}::uuid union all select 1 from knowledge_private_translations where actor_id=${ownerId}::uuid union all select 1 from knowledge_text_job_sources where actor_id=${ownerId}::uuid union all select 1 from knowledge_workbooks where owner_id=${ownerId}::uuid union all select 1 from knowledge_notes where owner_id=${ownerId}::uuid union all select 1 from knowledge_operation_receipts where owner_id=${ownerId}::uuid union all select 1 from knowledge_learner_attempts where actor_id=${ownerId}::uuid union all select 1 from knowledge_learner_events where actor_id=${ownerId}::uuid union all select 1 from knowledge_learner_completion where actor_id=${ownerId}::uuid union all select 1 from knowledge_learner_completion_receipts where actor_id=${ownerId}::uuid union all select 1 from knowledge_vocabulary_preferences where actor_id=${ownerId}::uuid union all select 1 from knowledge_vocabulary_attempts where actor_id=${ownerId}::uuid union all select 1 from knowledge_vocabulary_progress where actor_id=${ownerId}::uuid union all select 1 from knowledge_sentence_exercises where actor_id=${ownerId}::uuid union all select 1 from knowledge_sentence_attempts where actor_id=${ownerId}::uuid union all select 1 from knowledge_sentence_reviews where actor_id=${ownerId}::uuid union all select 1 from knowledge_sentence_exposures where actor_id=${ownerId}::uuid limit 1`,
    );

    return rows.length > 0;
}
