import { and, eq, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
    aiCreditActionsTable as accountingActions,
    aiCreditActionAttemptsTable as accountingAttempts,
} from '../../../../ai-credits/infrastructure/persistence/drizzle/action-accounting-schema';
import { settleLegacyAction } from '../../../../ai-credits/infrastructure/persistence/drizzle/legacy-action-accounting';
import type { SentenceContext } from '../../../application/ports/sentence-practice-store';
import { type SentenceTransaction } from './sentence-persistence-support';
import {
    sentencePreparationChildrenTable as children,
    sentencePreparationActionsTable as parentActions,
    sentencePreparationsTable as preparations,
} from './sentence-preparation-schema';
import type { Preparation } from './sentence-preparation-state';
import {
    accessFor,
    type SentencePreparationPersistenceContext,
} from './sentence-preparation-state';
import { sentenceWorkerJobs as jobs } from './sentence-worker-jobs';

export async function sentencePreparationAuthorizeParent(
    persistence: SentencePreparationPersistenceContext,
    tx: SentenceTransaction,
    row: Preparation,
    operationId: string,
    fingerprint: string,
    partitions: Array<
        {
            entryId: string;
            learningVersion: number;
            sourceText: string;
            targetText: string;
        }[]
    >,
    context: SentenceContext,
) {
    const actionId = randomUUID();
    const candidates = (partitions.find((batch) => batch.length > 0) ?? [])
        .slice(0, 12)
        .map(({ entryId, learningVersion, sourceText, targetText }) => ({
            entryId,
            learningVersion,
            sourceText,
            targetText,
        }));
    const admitted = await persistence.policy.authorizeAction(
        tx,
        accessFor(row),
        {
            actionId,
            operationId,
            fingerprint,
            inputPayload: {
                schemaVersion: 1,
                generationPolicyVersion: 1,
                dictionaryId: row.dictionaryId,
                direction: row.direction,
                sourceLanguage: row.sourceLanguage,
                targetLanguage: row.targetLanguage,
                priorityEntryId: candidates[0]?.entryId,
                candidates,
            },
        },
        context,
    );

    await tx.insert(parentActions).values({
        actionId,
        preparationId: row.id,
        selectedExecutionSnapshot: admitted.snapshot,
        executionRevisionId: admitted.revisionId,
        createdAt: context.now,
    });

    await tx
        .update(preparations)
        .set({ currentActionId: actionId })
        .where(eq(preparations.id, row.id));
}

export async function sentencePreparationSettleParent(
    tx: SentenceTransaction,
    row: Preparation,
    at: Date,
    stopped = false,
) {
    if (!row.currentActionId) return;
    const [parent] = await tx
        .select()
        .from(accountingActions)
        .where(eq(accountingActions.id, row.currentActionId));

    if (!parent || parent.state !== 'active') return;
    const attempts = await tx
        .select()
        .from(accountingAttempts)
        .where(eq(accountingAttempts.actionId, parent.id));

    // A running/ambiguous child is recovered by its worker fence before the hold is closed.
    if (attempts.some((call) => call.state === 'dispatched')) return;
    const [usable] = await tx
        .select({ id: jobs.id })
        .from(jobs)
        .innerJoin(children, eq(children.jobId, jobs.id))
        .where(
            and(
                eq(children.preparationId, row.id),
                attempts.length
                    ? inArray(
                          jobs.id,
                          attempts.map((call) => call.executionJobId),
                      )
                    : sql`false`,
                eq(jobs.executionState, 'completed'),
                sql`${jobs.resultExerciseId} is not null`,
                sql`${jobs.selectedExecutionSnapshot}->>'actionParentId'=${parent.id}`,
            ),
        )
        .limit(1);
    const outcome = stopped ? 'stopped' : usable ? 'success' : 'failure';
    await tx
        .update(parentActions)
        .set({ terminalOutcome: outcome })
        .where(eq(parentActions.actionId, parent.id));

    await settleLegacyAction(tx, {
        id: parent.id,
        ownerId: row.learnerId,
        outcome,
        at,
    });
}

export async function sentencePreparationParentAvailable(
    tx: SentenceTransaction,
    row: Preparation,
    now: Date,
) {
    if (!row.currentActionId) return false;
    const [parent] = await tx
        .select()
        .from(accountingActions)
        .where(eq(accountingActions.id, row.currentActionId));

    if (!parent || parent.state !== 'active' || parent.deadlineAt <= now)
        return false;
    const attempts = await tx
        .select()
        .from(accountingAttempts)
        .where(eq(accountingAttempts.actionId, parent.id));

    return (
        attempts.length < 5 &&
        attempts.reduce(
            (sum, call) => sum + (call.outputTokens ?? call.outputLimit),
            0,
        ) < parent.outputLimit
    );
}
