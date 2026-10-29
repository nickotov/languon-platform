import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import type {
    SentenceNextRequest,
    SentencePrepareRequest,
} from '@languon/contracts';
import type { VocabularyPracticeActor } from '../../../application/vocabulary-practice-store';
import type { KnowledgeTransaction } from './knowledge-transaction';
import type { VocabularyPracticeContent } from './vocabulary-practice-source';
import { sourceSentenceEntries } from './knowledge-sentence-context';
import {
    knowledgeSentenceExercisesTable as exercises,
    knowledgeSentenceExposuresTable as exposures,
    knowledgeSentenceReviewsTable as reviews,
    knowledgeSentenceAttemptsTable as attempts,
} from './knowledge-sentence-schema';

/** Filter historical rows in PostgreSQL; only current per-entry epochs contribute. */
export function currentKnowledgeSentenceCondition(
    material: VocabularyPracticeContent,
) {
    const epochs = Object.fromEntries(
        material.entries.map((entry) => [
            entry.entryId,
            String(entry.learningVersion),
        ]),
    );

    return and(
        sql`jsonb_array_length(${exercises.provenance}) > 0`,
        sql`not exists(select 1 from jsonb_array_elements(${exercises.provenance}) p where (${JSON.stringify(epochs)}::jsonb ->> (p->>'entryId')) is distinct from (p->>'learningVersion'))`,
        sql`(${exercises.publicContent}->>'sourceLanguage') = case when (${exercises.publicContent}->>'direction')='source-to-target' then ${material.sourceLanguage} else ${material.targetLanguage} end`,
        sql`(${exercises.publicContent}->>'targetLanguage') = case when (${exercises.publicContent}->>'direction')='source-to-target' then ${material.targetLanguage} else ${material.sourceLanguage} end`,
    );
}

export async function selectKnowledgeSentencePool(
    tx: KnowledgeTransaction,
    source: VocabularyPracticeActor,
    material: VocabularyPracticeContent,
    input: SentencePrepareRequest | SentenceNextRequest,
) {
    const selected = sourceSentenceEntries(
        material,
        input.direction,
        input.scope,
    );
    const selectedIds = selected.entries.map((entry) => entry.entryId);
    const base = and(
        eq(exercises.actorId, source.actorId),
        eq(exercises.noteId, source.noteId),
        eq(exercises.blockId, source.blockId),
        sql`${exercises.publicContent}->>'direction'=${input.direction}`,
        currentKnowledgeSentenceCondition(material),
        sql`not exists(select 1 from jsonb_array_elements(${exercises.provenance}) p where not (${JSON.stringify(selectedIds)}::jsonb ? (p->>'entryId')))`,
    );
    const seen = sql`exists(select 1 from ${exposures} where ${exposures.actorId}=${source.actorId} and ${exposures.exerciseId}=${exercises.id})`;
    const reviewed = sql`(exists(select 1 from ${reviews} where ${reviews.actorId}=${source.actorId} and ${reviews.exerciseId}=${exercises.id}) or exists(select 1 from ${attempts} where ${attempts.actorId}=${source.actorId} and ${attempts.exerciseId}=${exercises.id}))`;
    const [totals] = await tx
        .select({
            unchecked: sql<number>`count(*) filter(where not ${reviewed})::integer`,
            review: sql<number>`count(*) filter(where ${seen})::integer`,
        })
        .from(exercises)
        .where(base);
    const usedRows = await tx.execute<{ entry_id: string }>(
        sql`select distinct p->>'entryId' as entry_id from ${exercises} cross join lateral jsonb_array_elements(${exercises.provenance}) p where ${base} and ${seen}`,
    );
    const used = new Set(usedRows.map((row) => row.entry_id));
    const exact =
        'replayExerciseId' in input && input.replayExerciseId
            ? [input.replayExerciseId]
            : 'replayExerciseIds' in input
              ? input.replayExerciseIds
              : undefined;
    const visited =
        'visitedExerciseIds' in input ? input.visitedExerciseIds : [];
    const saved = await tx
        .select()
        .from(exercises)
        .where(
            and(
                base,
                exact
                    ? inArray(exercises.id, exact)
                    : input.mode === 'new-only'
                      ? sql`false`
                      : and(
                            visited.length
                                ? notInArray(exercises.id, visited)
                                : undefined,
                            input.mode === 'review-only' ? seen : undefined,
                        ),
            ),
        )
        .orderBy(exercises.createdAt, exercises.id)
        .limit(exact?.length ?? 1);

    return {
        ...selected,
        saved,
        used,
        savedUncheckedCount: totals?.unchecked ?? 0,
        savedReviewCount: totals?.review ?? 0,
    };
}
