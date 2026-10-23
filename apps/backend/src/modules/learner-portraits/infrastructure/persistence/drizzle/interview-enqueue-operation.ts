import { and, eq, inArray, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { lockTextAiCapacity } from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { withActionQuotePersistence } from '../../../../ai-credits/infrastructure/action-allowance-consent';
import { withActionBilling } from '../../../../ai-credits/infrastructure/persistence/drizzle/action-billing';
import type {
    InterviewOperation,
    InterviewStore,
} from '../../../application/ports/interview-store';
import {
    PortraitInterviewDailyQuotaError,
    PortraitInterviewResourceLimitError,
} from '../../../application/ports/interview-store';
import {
    PortraitConflictError,
    PortraitDraftUnavailableError,
} from '../../../application/ports/portrait-store';
import {
    lockPortraitOwner,
    readPortraitState,
    savePortraitState,
} from './drizzle-portrait-store';
import {
    expireOwner,
    operation,
    ttl,
    validateContext,
    type InterviewStoreContext,
} from './interview-persistence-support';
import {
    portraitInterviewDailyAdmissionsTable as dailyAdmissions,
    learnerPortraitInterviewsTable as interviews,
    learnerPortraitInterviewOperationsTable as operations,
} from './schema';

export function enqueue(
    persistence: InterviewStoreContext,
    input: Parameters<InterviewStore['enqueue']>[0],
) {
    return withActionQuotePersistence(persistence.database, () =>
        persistence.database.transaction(async (tx) => {
            await lockTextAiCapacity(tx);
            await lockPortraitOwner(tx, input.ownerId);
            await expireOwner(tx, input.ownerId, input.now);
            const fingerprint = createHash('sha256')
                .update(
                    JSON.stringify({
                        interviewId: input.interviewId,
                        input: input.input,
                    }),
                )
                .digest('hex');
            const [replay] = await tx
                .select()
                .from(operations)
                .where(
                    and(
                        eq(operations.ownerId, input.ownerId),
                        eq(operations.idempotencyKey, input.idempotencyKey),
                    ),
                );

            if (replay) {
                if (replay.fingerprint !== fingerprint)
                    throw new PortraitConflictError();

                return withActionBilling(
                    tx,
                    operation(replay),
                    replay.id,
                    replay.ownerId,
                );
            }

            const state = await readPortraitState(tx, input.ownerId);
            if (
                state.version !== input.expectedVersion ||
                state.generation !== input.expectedGeneration
            )
                throw new PortraitConflictError();
            const [interview] = await tx
                .select()
                .from(interviews)
                .where(
                    and(
                        eq(interviews.ownerId, input.ownerId),
                        eq(interviews.id, input.interviewId),
                    ),
                );

            if (!interview) throw new PortraitDraftUnavailableError();
            const [active] = await tx
                .select({ id: operations.id })
                .from(operations)
                .where(
                    and(
                        eq(operations.ownerId, input.ownerId),
                        inArray(operations.state, ['queued', 'running']),
                    ),
                );

            if (active) throw new PortraitConflictError();
            if (interview.context.messages.length >= 40)
                throw new PortraitInterviewResourceLimitError(
                    'Interview context limit reached; review the portrait or begin a new interview.',
                );
            const context = {
                ...interview.context,
                locale: input.input.requestedLocale ?? interview.context.locale,
                approvedItems: state.approved?.items ?? null,
                draftItems: state.draft?.items ?? null,
            };
            const initial: InterviewOperation = {
                id: input.id,
                interviewId: input.interviewId,
                ownerId: input.ownerId,
                generation: state.generation,
                version: state.version,
                state: 'queued',
                input: input.input,
                context,
                execution: {},
                result: null,
                errorCode: null,
            };

            await tx.insert(operations).values({
                ...initial,
                idempotencyKey: input.idempotencyKey,
                fingerprint,
                createdAt: input.now,
                updatedAt: input.now,
            });

            validateContext(context);
            const execution = await persistence.admission(
                tx,
                initial,
                input.paidAcknowledged,
                input.now,
                { requestKey: input.idempotencyKey, fingerprint },
            );

            await tx
                .update(operations)
                .set({ execution })
                .where(eq(operations.id, input.id));

            // Same transaction as admission. Replay returns above; rollback does not consume quota.
            const [quota] = await tx
                .insert(dailyAdmissions)
                .values({
                    ownerId: input.ownerId,
                    utcDay: input.now.toISOString().slice(0, 10),
                    admitted: 1,
                })
                .onConflictDoUpdate({
                    target: [dailyAdmissions.ownerId, dailyAdmissions.utcDay],
                    set: { admitted: sql`${dailyAdmissions.admitted} + 1` },
                    setWhere: sql`${dailyAdmissions.admitted} < 30`,
                })
                .returning({ admitted: dailyAdmissions.admitted });

            if (!quota)
                throw new PortraitInterviewDailyQuotaError(
                    'Daily interview limit reached. Try again tomorrow (UTC).',
                );
            const expiresAt = new Date(input.now.getTime() + ttl);
            await tx
                .update(interviews)
                .set({ context, expiresAt, updatedAt: input.now })
                .where(eq(interviews.id, interview.id));

            if (state.draft)
                await savePortraitState(
                    tx,
                    input.ownerId,
                    {
                        ...state,
                        draft: {
                            ...state.draft,
                            expiresAt: expiresAt.toISOString(),
                        },
                    },
                    input.now,
                );

            return withActionBilling(
                tx,
                { ...initial, execution },
                initial.id,
                initial.ownerId,
            );
        }),
    );
}
