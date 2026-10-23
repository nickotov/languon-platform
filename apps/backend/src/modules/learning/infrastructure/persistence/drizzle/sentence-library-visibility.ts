import { sql, type SQL } from 'drizzle-orm';
import { sentenceExercisesTable as exercises } from './sentence-schema';
import {
    sentencePersonalVisibilityTable as personal,
    sentenceGlobalVisibilityTable as global,
} from './sentence-library-schema';
import type { SentenceTransaction } from './sentence-persistence-support';
import { SentenceUnavailableError } from '../../../domain/sentence-errors';
/** Apply only to practice selection/admission, never historical readers. */
export function sentencePracticeVisibilityCondition(learnerId: string): SQL {
    return sql`not exists(select 1 from ${personal} p where p.exercise_id=${exercises.id} and p.learner_id=${learnerId}::uuid and p.archived_at is not null) and not exists(select 1 from ${global} g where g.exercise_id=${exercises.id} and g.archived_at is not null)`;
}

export async function assertSentencePracticeVisible(
    tx: SentenceTransaction,
    exerciseId: string,
    learnerId: string,
): Promise<void> {
    const rows = await tx.execute(
        sql`select ${exercises.id} from ${exercises} where ${exercises.id}=${exerciseId}::uuid and (${sentencePracticeVisibilityCondition(learnerId)})`,
    );

    if (!rows.length) throw new SentenceUnavailableError();
}
