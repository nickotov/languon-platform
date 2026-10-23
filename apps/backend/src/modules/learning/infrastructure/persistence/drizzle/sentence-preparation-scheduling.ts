import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { aiCreditActionsTable as accountingActions } from '../../../../ai-credits/infrastructure/persistence/drizzle/action-accounting-schema';
import type { SentenceContext } from '../../../application/ports/sentence-practice-store';
import {
    sentencePreparationActionsTable as parentActions,
    sentencePreparationsTable as preparations,
} from './sentence-preparation-schema';
import type { SentencePreparationPersistenceContext } from './sentence-preparation-state';

export async function sentencePreparationNextCandidate(
    persistence: SentencePreparationPersistenceContext,
    context: SentenceContext,
) {
    // Begin with the compact active/deadline index; never scan settled preparation history.
    const [expiredParent] = await persistence.database
        .select({ preparation: preparations })
        .from(accountingActions)
        .innerJoin(
            parentActions,
            eq(parentActions.actionId, accountingActions.id),
        )
        .innerJoin(
            preparations,
            eq(preparations.id, parentActions.preparationId),
        )
        .where(
            and(
                eq(accountingActions.state, 'active'),
                sql`${accountingActions.deadlineAt}<=${context.now.toISOString()}::timestamptz`,
                eq(preparations.state, 'paused'),
                eq(preparations.currentActionId, accountingActions.id),
            ),
        )
        .orderBy(asc(accountingActions.deadlineAt), asc(accountingActions.id))
        .limit(1);
    const [candidate] = expiredParent
        ? [expiredParent.preparation]
        : await persistence.database
              .select()
              .from(preparations)
              .where(
                  inArray(preparations.state, [
                      'queued',
                      'running',
                      'stopping',
                  ]),
              )
              .orderBy(asc(preparations.updatedAt), asc(preparations.id))
              .limit(1);

    return candidate;
}
