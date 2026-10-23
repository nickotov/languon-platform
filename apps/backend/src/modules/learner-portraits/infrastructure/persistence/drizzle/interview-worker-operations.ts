import {
    PortraitInterviewerOutputSchema,
    type PortraitInterviewerOutput,
} from '@languon/contracts';
import { and, eq, lte, or } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
    lockTextAiCapacity,
    readTextAiCapacity,
} from '../../../../../infrastructure/text-ai/text-ai-capacity';
import {
    defaultTextAiProviderBudgetPolicy,
    type TextAiProviderBudgetPolicy,
} from '../../../../text-ai/application/text-ai-provider-catalog';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import type {
    ClaimedInterviewOperation,
    InterviewContext,
} from '../../../application/ports/interview-store';
import { PortraitInterviewResourceLimitError } from '../../../application/ports/interview-store';
import {
    PortraitConflictError,
    PortraitDraftUnavailableError,
} from '../../../application/ports/portrait-store';
import { settleInterviewAction } from '../../interview-action-accounting';
import { type PortraitTransaction } from './drizzle-portrait-store';
import {
    emptyContext,
    isInvalid,
    leaseMs,
    operation,
    validateContext,
    type InterviewStoreContext,
} from './interview-persistence-support';
import {
    learnerPortraitInterviewsTable as interviews,
    learnerPortraitInterviewOperationsTable as operations,
} from './schema';

export function claim(
    persistence: InterviewStoreContext,
): Promise<ClaimedInterviewOperation | null> {
    return persistence.database.transaction(async (tx) => {
        await lockTextAiCapacity(tx);
        const now = new Date();
        const [found] = await tx
            .select()
            .from(operations)
            .where(
                or(
                    eq(operations.state, 'queued'),
                    and(
                        eq(operations.state, 'running'),
                        lte(operations.leaseUntil, now),
                    ),
                ),
            )
            .orderBy(operations.createdAt)
            .limit(1);

        if (!found) return null;
        // Keep the same capacity -> owner -> operation lock order as dispatch,
        // manual updates, deletion and credit settlement.
        await tx
            .select({ id: usersTable.id })
            .from(usersTable)
            .where(eq(usersTable.id, found.ownerId))
            .for('update');

        const [candidate] = await tx
            .select()
            .from(operations)
            .where(
                and(
                    eq(operations.id, found.id),
                    or(
                        eq(operations.state, 'queued'),
                        and(
                            eq(operations.state, 'running'),
                            lte(operations.leaseUntil, now),
                        ),
                    ),
                ),
            )
            .for('update');

        if (!candidate) return null;
        if (candidate.state === 'running') {
            if (!persistence.recover)
                throw new Error(
                    'Interview recovery settlement adapter required',
                );
            await persistence.recover(tx, candidate.id, now);
            await tx
                .update(operations)
                .set({
                    state: candidate.cancelRequested ? 'cancelled' : 'failed',
                    errorCode:
                        candidate.cancelRequested &&
                        candidate.errorCode === 'explicit_stop'
                            ? 'explicit_stop'
                            : 'interrupted',
                    context: emptyContext(),
                    leaseToken: null,
                    leaseUntil: null,
                    updatedAt: now,
                })
                .where(eq(operations.id, candidate.id));

            return null;
        }

        const capacity = await readTextAiCapacity(tx, {
            actorId: candidate.ownerId,
            now,
            budget:
                (candidate.execution.budget as
                    TextAiProviderBudgetPolicy | undefined) ??
                defaultTextAiProviderBudgetPolicy,
        });

        if (capacity.globalRunning >= 10 || capacity.actorRunning >= 1)
            return null;
        const leaseToken = randomUUID();
        const [row] = await tx
            .update(operations)
            .set({
                state: 'running',
                leaseToken,
                leaseUntil: new Date(now.getTime() + leaseMs),
                updatedAt: now,
            })
            .where(eq(operations.id, candidate.id))
            .returning();

        return row ? { ...operation(row), leaseToken } : null;
    });
}

export async function heartbeat(
    persistence: InterviewStoreContext,
    claim: ClaimedInterviewOperation,
) {
    await withOperation(persistence, claim, async (tx) => {
        const now = new Date();
        if (await isInvalid(tx, claim, now))
            throw new PortraitDraftUnavailableError();
        await tx
            .update(operations)
            .set({
                leaseUntil: new Date(now.getTime() + leaseMs),
                updatedAt: now,
            })
            .where(eq(operations.id, claim.id));
    });
}

export async function withOperation<T>(
    persistence: InterviewStoreContext,
    claim: ClaimedInterviewOperation,
    work: (tx: PortraitTransaction) => Promise<T>,
): Promise<T> {
    return persistence.database.transaction(async (tx) => {
        // Accounting uses the global capacity lock before owner/operation locks.
        await lockTextAiCapacity(tx);
        await tx
            .select({ id: usersTable.id })
            .from(usersTable)
            .where(eq(usersTable.id, claim.ownerId))
            .for('update');

        const [row] = await tx
            .select()
            .from(operations)
            .where(eq(operations.id, claim.id))
            .for('update');

        if (
            !row ||
            row.ownerId !== claim.ownerId ||
            row.leaseToken !== claim.leaseToken ||
            row.state !== 'running' ||
            !row.leaseUntil ||
            row.leaseUntil <= new Date()
        )
            throw new PortraitConflictError();

        return work(tx);
    });
}

export async function complete(
    persistence: InterviewStoreContext,
    claim: ClaimedInterviewOperation,
    value: PortraitInterviewerOutput,
    now: Date,
) {
    const result = PortraitInterviewerOutputSchema.parse(value);
    await withOperation(persistence, claim, async (tx) => {
        if (await isInvalid(tx, claim, now)) {
            const [invalid] = await tx
                .select({
                    cancelRequested: operations.cancelRequested,
                    errorCode: operations.errorCode,
                })
                .from(operations)
                .where(eq(operations.id, claim.id));
            const explicitlyStopped =
                invalid?.cancelRequested &&
                invalid.errorCode === 'explicit_stop';

            await tx
                .update(operations)
                .set({
                    state: 'cancelled',
                    context: emptyContext(),
                    input: { kind: 'skip', topic: 'update' },
                    result: null,
                    errorCode: explicitlyStopped
                        ? 'explicit_stop'
                        : 'portrait_changed',
                    leaseUntil: null,
                    updatedAt: now,
                })
                .where(eq(operations.id, claim.id));

            await settleInterviewAction(
                tx,
                claim,
                explicitlyStopped ? 'stopped' : 'failure',
                now,
            );

            return;
        }

        const [interview] = await tx
            .select()
            .from(interviews)
            .where(eq(interviews.id, claim.interviewId))
            .for('update');

        if (!interview) throw new PortraitDraftUnavailableError();
        const userContent =
            claim.input.kind === 'skip'
                ? 'Skipped'
                : claim.input.kind === 'chat'
                  ? claim.input.text
                  : (claim.input.text ??
                    claim.input.selected?.join(', ') ??
                    '');

        if (interview.context.messages.length >= 40)
            throw new PortraitInterviewResourceLimitError(
                'Interview context limit reached; review the portrait or begin a new interview.',
            );
        const messages: InterviewContext['messages'] = [
            ...interview.context.messages,
            { role: 'user', content: userContent },
            { role: 'assistant', content: result.message },
        ];
        const completesTopic =
            claim.input.kind !== 'chat' || Boolean(result.answerSummary);
        const context = {
            ...interview.context,
            locale:
                interview.context.locale !== claim.context.locale
                    ? interview.context.locale
                    : (result.locale ?? claim.context.locale),
            messages,
            completedTopics: completesTopic
                ? Array.from(
                      new Set([
                          ...interview.context.completedTopics,
                          claim.input.topic,
                      ]),
                  )
                : interview.context.completedTopics,
        };

        validateContext(context);
        await tx
            .update(interviews)
            .set({ context })
            .where(eq(interviews.id, interview.id));

        await tx
            .update(operations)
            .set({
                state: 'succeeded',
                result,
                context: emptyContext(),
                leaseUntil: null,
                updatedAt: now,
            })
            .where(eq(operations.id, claim.id));

        await settleInterviewAction(tx, claim, 'success', now);
    });
}

export async function fail(
    persistence: InterviewStoreContext,
    claim: ClaimedInterviewOperation,
    code: string,
    now: Date,
) {
    await withOperation(persistence, claim, async (tx) => {
        const [row] = await tx
            .select({
                cancelRequested: operations.cancelRequested,
                errorCode: operations.errorCode,
            })
            .from(operations)
            .where(eq(operations.id, claim.id));

        await tx
            .update(operations)
            .set({
                state:
                    code === 'cancelled' || row?.cancelRequested
                        ? 'cancelled'
                        : 'failed',
                errorCode:
                    row?.cancelRequested && row.errorCode === 'explicit_stop'
                        ? 'explicit_stop'
                        : code.slice(0, 80),
                context: emptyContext(),
                leaseUntil: null,
                updatedAt: now,
            })
            .where(eq(operations.id, claim.id));

        await settleInterviewAction(
            tx,
            claim,
            row?.cancelRequested && row.errorCode === 'explicit_stop'
                ? 'stopped'
                : 'failure',
            now,
        );
    });
}
