import {
    PortraitInterviewerOutputSchema,
    PortraitInterviewSubmissionSchema,
    PortraitLocaleSchema,
} from '@languon/contracts';
import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { withActionBilling } from '../../../../ai-credits/infrastructure/persistence/drizzle/action-billing';
import type {
    InterviewContext,
    InterviewStore,
} from '../../../application/ports/interview-store';
import {
    PortraitConflictError,
    PortraitDraftUnavailableError,
} from '../../../application/ports/portrait-store';
import { settleInterviewAction } from '../../interview-action-accounting';
import {
    lockPortraitOwner,
    readPortraitState,
    savePortraitState,
} from './drizzle-portrait-store';
import {
    emptyContext,
    expireOwner,
    operation,
    resumeQuestion,
    ttl,
    validateContext,
    type InterviewStoreContext,
} from './interview-persistence-support';
import {
    learnerPortraitInterviewsTable as interviews,
    learnerPortraitInterviewOperationsTable as operations,
} from './schema';

export function status(
    persistence: InterviewStoreContext,
    ownerId: string,
    now: Date,
) {
    return persistence.database.transaction(async (tx) => {
        await lockPortraitOwner(tx, ownerId);
        const [session] = await tx
            .select({
                id: interviews.id,
                locale: sql<string>`${interviews.context}->>'locale'`,
                expiresAt: interviews.expiresAt,
            })
            .from(interviews)
            .where(
                and(
                    eq(interviews.ownerId, ownerId),
                    gt(interviews.expiresAt, now),
                ),
            );

        if (!session) return null;

        return {
            id: session.id,
            locale: PortraitLocaleSchema.parse(session.locale),
            expiresAt: session.expiresAt.toISOString(),
        };
    });
}

export function start(
    persistence: InterviewStoreContext,
    input: Parameters<InterviewStore['start']>[0],
) {
    return persistence.database.transaction(async (tx) => {
        await lockPortraitOwner(tx, input.ownerId);
        await expireOwner(tx, input.ownerId, input.now);
        const state = await readPortraitState(tx, input.ownerId);
        if (state.version !== input.expectedVersion)
            throw new PortraitConflictError();
        const [current] = await tx
            .select()
            .from(interviews)
            .where(eq(interviews.ownerId, input.ownerId));

        if (current) {
            const context = {
                ...current.context,
                approvedItems: state.approved?.items ?? null,
                draftItems: state.draft?.items ?? null,
            };

            validateContext(context);
            await tx
                .update(interviews)
                .set({ context })
                .where(eq(interviews.id, current.id));

            const [active] = await tx
                .select({
                    id: operations.id,
                    interviewId: operations.interviewId,
                    state: operations.state,
                    cancelRequested: operations.cancelRequested,
                })
                .from(operations)
                .where(
                    and(
                        eq(operations.ownerId, input.ownerId),
                        eq(operations.interviewId, current.id),
                        inArray(operations.state, ['queued', 'running']),
                    ),
                )
                .limit(1);
            const activeOperation = active
                ? {
                      id: active.id,
                      interviewId: active.interviewId,
                      state: active.cancelRequested
                          ? ('cancelled' as const)
                          : active.state === 'queued'
                            ? ('queued' as const)
                            : ('running' as const),
                      result: null,
                      errorCode: null,
                  }
                : undefined;
            const [latest] = await tx
                .select({
                    id: operations.id,
                    interviewId: operations.interviewId,
                    result: operations.result,
                    version: operations.version,
                    generation: operations.generation,
                })
                .from(operations)
                .where(
                    and(
                        eq(operations.ownerId, input.ownerId),
                        eq(operations.interviewId, current.id),
                        eq(operations.state, 'succeeded'),
                    ),
                )
                .orderBy(
                    desc(operations.updatedAt),
                    desc(operations.createdAt),
                    desc(operations.id),
                )
                .limit(1);
            const latestCompletedOperation = latest?.result
                ? {
                      id: latest.id,
                      interviewId: latest.interviewId,
                      state: 'succeeded' as const,
                      result: PortraitInterviewerOutputSchema.parse(
                          latest.result,
                      ),
                      errorCode: null,
                      baseVersion: latest.version,
                      baseGeneration: latest.generation,
                      stale:
                          latest.version !== state.version ||
                          latest.generation !== state.generation,
                  }
                : undefined;
            // Recovery contains only the most recently admitted input, never
            // pricing, provider execution, owner identifiers, or historical failures.
            const [last] = await tx
                .select({
                    id: operations.id,
                    interviewId: operations.interviewId,
                    state: operations.state,
                    input: operations.input,
                    errorCode: operations.errorCode,
                    version: operations.version,
                    generation: operations.generation,
                })
                .from(operations)
                .where(
                    and(
                        eq(operations.ownerId, input.ownerId),
                        eq(operations.interviewId, current.id),
                    ),
                )
                .orderBy(desc(operations.createdAt), desc(operations.id))
                .limit(1);
            const lastAttempt =
                last && (last.state === 'failed' || last.state === 'cancelled')
                    ? {
                          id: last.id,
                          interviewId: last.interviewId,
                          state: last.state,
                          input: PortraitInterviewSubmissionSchema.parse(
                              last.input,
                          ),
                          errorCode: last.errorCode,
                          baseVersion: last.version,
                          baseGeneration: last.generation,
                          stale:
                              last.version !== state.version ||
                              last.generation !== state.generation,
                      }
                    : undefined;
            const currentQuestion = latest?.result
                ? resumeQuestion(
                      PortraitInterviewerOutputSchema.parse(latest.result),
                  )
                : undefined;

            return {
                interviewId: current.id,
                expiresAt: current.expiresAt.toISOString(),
                context,
                ...(currentQuestion ? { currentQuestion } : {}),
                ...(activeOperation ? { activeOperation } : {}),
                ...(lastAttempt ? { lastAttempt } : {}),
                ...(latestCompletedOperation
                    ? { latestCompletedOperation }
                    : {}),
            };
        }

        const context: InterviewContext = {
            locale: input.locale,
            approvedItems: state.approved?.items ?? null,
            draftItems: state.draft?.items ?? null,
            messages: [],
            completedTopics: [],
        };
        const id = randomUUID(),
            expiresAt = new Date(input.now.getTime() + ttl);

        validateContext(context);
        await tx.insert(interviews).values({
            id,
            ownerId: input.ownerId,
            context,
            expiresAt,
            createdAt: input.now,
            updatedAt: input.now,
        });

        return {
            interviewId: id,
            expiresAt: expiresAt.toISOString(),
            context,
        };
    });
}

export function setLocale(
    persistence: InterviewStoreContext,
    input: Parameters<InterviewStore['setLocale']>[0],
) {
    return persistence.database.transaction(async (tx) => {
        await lockPortraitOwner(tx, input.ownerId);
        await expireOwner(tx, input.ownerId, input.now);
        const state = await readPortraitState(tx, input.ownerId);
        if (state.version !== input.expectedVersion)
            throw new PortraitConflictError();
        const [session] = await tx
            .select()
            .from(interviews)
            .where(
                and(
                    eq(interviews.id, input.interviewId),
                    eq(interviews.ownerId, input.ownerId),
                ),
            );

        if (!session) throw new PortraitDraftUnavailableError();
        const context = { ...session.context, locale: input.locale },
            expiresAt = new Date(input.now.getTime() + ttl);

        validateContext(context);
        await tx
            .update(interviews)
            .set({ context, expiresAt, updatedAt: input.now })
            .where(eq(interviews.id, session.id));

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

        return {
            interviewId: session.id,
            expiresAt: expiresAt.toISOString(),
            context,
        };
    });
}

export async function read(
    persistence: InterviewStoreContext,
    ownerId: string,
    id: string,
) {
    return persistence.database.transaction(async (tx) => {
        await lockPortraitOwner(tx, ownerId);
        await expireOwner(tx, ownerId, new Date());
        const [row] = await tx
            .select()
            .from(operations)
            .where(and(eq(operations.ownerId, ownerId), eq(operations.id, id)));
        const [session] = await tx
            .select({ id: interviews.id })
            .from(interviews)
            .where(
                and(
                    eq(interviews.ownerId, ownerId),
                    eq(interviews.id, row?.interviewId ?? id),
                ),
            );

        if (!row || !session) return null;

        return withActionBilling(
            tx,
            row.cancelRequested
                ? { ...operation(row), state: 'cancelled' as const }
                : operation(row),
            row.id,
            row.ownerId,
        );
    });
}

export async function stop(
    persistence: InterviewStoreContext,
    ownerId: string,
    id: string,
    now: Date,
) {
    await persistence.database.transaction(async (tx) => {
        await lockPortraitOwner(tx, ownerId);
        await tx
            .update(operations)
            .set({
                cancelRequested: true,
                errorCode: 'explicit_stop',
                updatedAt: now,
            })
            .where(
                and(
                    eq(operations.ownerId, ownerId),
                    eq(operations.id, id),
                    inArray(operations.state, ['queued', 'running']),
                ),
            );

        await tx
            .update(operations)
            .set({ state: 'cancelled', context: emptyContext() })
            .where(
                and(
                    eq(operations.id, id),
                    eq(operations.ownerId, ownerId),
                    eq(operations.state, 'queued'),
                ),
            );

        const [stopped] = await tx
            .select()
            .from(operations)
            .where(and(eq(operations.id, id), eq(operations.ownerId, ownerId)));

        if (stopped?.state === 'cancelled')
            await settleInterviewAction(tx, stopped, 'stopped', now);
    });
}
