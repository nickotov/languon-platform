import { recoverExpiredPortraitOperations } from './portrait-deletion-participant';
import { PortraitInterviewResourceLimitError } from '../../../application/ports/interview-store';
import {
    defaultTextAiProviderBudgetPolicy,
    type TextAiProviderBudgetPolicy,
} from '../../../../text-ai/application/text-ai-provider-catalog';
import { randomUUID, createHash } from 'node:crypto';
import { and, desc, eq, gt, inArray, lte, or, sql } from 'drizzle-orm';
import {
    PortraitInterviewerOutputSchema,
    PortraitInterviewSubmissionSchema,
    PortraitLocaleSchema,
    type PortraitInterviewerOutput,
} from '@languon/contracts';
import type {
    ClaimedInterviewOperation,
    InterviewContext,
    InterviewOperation,
    InterviewStore,
} from '../../../application/ports/interview-store';
import {
    PortraitConflictError,
    PortraitDraftUnavailableError,
} from '../../../application/ports/portrait-store';
import {
    learnerPortraitInterviewOperationsTable as operations,
    learnerPortraitInterviewsTable as interviews,
} from './schema';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    lockTextAiCapacity,
    readTextAiCapacity,
} from '../../../../../infrastructure/text-ai/text-ai-capacity';
import {
    clearPortraitInterview,
    lockPortraitOwner,
    readPortraitState,
    savePortraitState,
    type PortraitDatabase,
    type PortraitTransaction,
} from './drizzle-portrait-store';

const ttl = 14 * 86400_000;
const leaseMs = 60_000;
const emptyContext = (): InterviewContext => ({
    locale: 'en',
    approvedItems: null,
    draftItems: null,
    messages: [],
    completedTopics: [],
});
type Row = typeof operations.$inferSelect;
function operation(row: Row): InterviewOperation {
    return {
        id: row.id,
        interviewId: row.interviewId,
        ownerId: row.ownerId,
        generation: row.generation,
        version: row.version,
        state: row.state,
        input: row.input,
        context: row.context,
        execution: row.execution,
        result: row.result,
        errorCode: row.errorCode,
    };
}
export type InterviewAdmission = (
    tx: PortraitTransaction,
    operation: InterviewOperation,
    paidAcknowledged: boolean,
    now: Date,
) => Promise<Record<string, unknown>>;
export class DrizzleInterviewStore implements InterviewStore {
    constructor(
        private readonly database: PortraitDatabase,
        private readonly admission: InterviewAdmission,
        private readonly recover?: (
            tx: PortraitTransaction,
            operationId: string,
            now: Date,
        ) => Promise<void>,
    ) {}
    status(ownerId: string, now: Date) {
        return this.database.transaction(async (tx) => {
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
    start(input: Parameters<InterviewStore['start']>[0]) {
        return this.database.transaction(async (tx) => {
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
                    last &&
                    (last.state === 'failed' || last.state === 'cancelled')
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
    setLocale(input: Parameters<InterviewStore['setLocale']>[0]) {
        return this.database.transaction(async (tx) => {
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
    enqueue(input: Parameters<InterviewStore['enqueue']>[0]) {
        return this.database.transaction(async (tx) => {
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
                return operation(replay);
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
            const execution = await this.admission(
                tx,
                initial,
                input.paidAcknowledged,
                input.now,
            );
            await tx
                .update(operations)
                .set({ execution })
                .where(eq(operations.id, input.id));
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
            return { ...initial, execution };
        });
    }
    async read(ownerId: string, id: string) {
        return this.database.transaction(async (tx) => {
            await lockPortraitOwner(tx, ownerId);
            await expireOwner(tx, ownerId, new Date());
            const [row] = await tx
                .select()
                .from(operations)
                .where(
                    and(eq(operations.ownerId, ownerId), eq(operations.id, id)),
                );
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
            return row.cancelRequested
                ? { ...operation(row), state: 'cancelled' as const }
                : operation(row);
        });
    }
    async stop(ownerId: string, id: string, now: Date) {
        await this.database.transaction(async (tx) => {
            await lockPortraitOwner(tx, ownerId);
            await tx
                .update(operations)
                .set({ cancelRequested: true, updatedAt: now })
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
        });
    }
    claim(): Promise<ClaimedInterviewOperation | null> {
        return this.database.transaction(async (tx) => {
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
                if (!this.recover)
                    throw new Error(
                        'Interview recovery settlement adapter required',
                    );
                await this.recover(tx, candidate.id, now);
                await tx
                    .update(operations)
                    .set({
                        state: candidate.cancelRequested
                            ? 'cancelled'
                            : 'failed',
                        errorCode: 'interrupted',
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
    async heartbeat(claim: ClaimedInterviewOperation) {
        await this.withOperation(claim, async (tx) => {
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
    async withOperation<T>(
        claim: ClaimedInterviewOperation,
        work: (tx: PortraitTransaction) => Promise<T>,
    ): Promise<T> {
        return this.database.transaction(async (tx) => {
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
    async complete(
        claim: ClaimedInterviewOperation,
        value: PortraitInterviewerOutput,
        now: Date,
    ) {
        const result = PortraitInterviewerOutputSchema.parse(value);
        await this.withOperation(claim, async (tx) => {
            if (await isInvalid(tx, claim, now)) {
                await tx
                    .update(operations)
                    .set({
                        state: 'cancelled',
                        context: emptyContext(),
                        input: { kind: 'skip', topic: 'update' },
                        result: null,
                        errorCode: 'portrait_changed',
                        leaseUntil: null,
                        updatedAt: now,
                    })
                    .where(eq(operations.id, claim.id));
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
        });
    }
    async fail(claim: ClaimedInterviewOperation, code: string, now: Date) {
        await this.withOperation(claim, async (tx) => {
            const [row] = await tx
                .select({ cancelRequested: operations.cancelRequested })
                .from(operations)
                .where(eq(operations.id, claim.id));
            await tx
                .update(operations)
                .set({
                    state:
                        code === 'cancelled' || row?.cancelRequested
                            ? 'cancelled'
                            : 'failed',
                    errorCode: code.slice(0, 80),
                    context: emptyContext(),
                    leaseUntil: null,
                    updatedAt: now,
                })
                .where(eq(operations.id, claim.id));
        });
    }
}
async function isInvalid(
    tx: PortraitTransaction,
    claim: Pick<
        InterviewOperation,
        'id' | 'interviewId' | 'ownerId' | 'generation' | 'version'
    >,
    now: Date,
) {
    const [row] = await tx
        .select()
        .from(operations)
        .where(eq(operations.id, claim.id));
    const [session] = await tx
        .select()
        .from(interviews)
        .where(eq(interviews.id, claim.interviewId));
    const state = await readPortraitState(tx, claim.ownerId);
    const [owner] = await tx
        .select({ status: usersTable.status })
        .from(usersTable)
        .where(eq(usersTable.id, claim.ownerId));
    return (
        owner?.status !== 'active' ||
        row?.cancelRequested ||
        !session ||
        session.expiresAt <= now ||
        state.generation !== claim.generation ||
        state.version !== claim.version
    );
}
async function expireOwner(
    tx: PortraitTransaction,
    ownerId: string,
    now: Date,
) {
    const state = await readPortraitState(tx, ownerId);
    const [session] = await tx
        .select()
        .from(interviews)
        .where(eq(interviews.ownerId, ownerId));
    if (
        (state.draft && new Date(state.draft.expiresAt) <= now) ||
        (session && session.expiresAt <= now)
    ) {
        await clearPortraitInterview(tx, ownerId);
        await savePortraitState(
            tx,
            ownerId,
            {
                ...state,
                draft: null,
                generation: state.generation + 1,
                version: state.version + 1,
            },
            now,
        );
    }
}
export async function expireLearnerPortraitInterviews(
    database: PortraitDatabase,
    now = new Date(),
): Promise<number> {
    const rows = await database.execute(
        sql`select i.owner_id from learner_portrait_interviews i join users u on u.id=i.owner_id where expires_at<=${now.toISOString()}::timestamptz union select p.owner_id from learner_portraits p join users u on u.id=p.owner_id where draft_expires_at<=${now.toISOString()}::timestamptz union select o.owner_id from learner_portrait_interview_operations o where o.state='running' and o.lease_until<=${now.toISOString()}::timestamptz limit 100`,
    );
    let count = 0;
    for (const row of rows) {
        await database.transaction(async (tx) => {
            const ownerId = String(row.owner_id);
            await recoverExpiredPortraitOperations(tx, ownerId, now);
            await tx
                .select({ id: usersTable.id })
                .from(usersTable)
                .where(eq(usersTable.id, ownerId))
                .for('update');
            await expireOwner(tx, ownerId, now);
        });
        count++;
    }
    return count;
}

export async function assertLiveInterviewOperation(
    tx: PortraitTransaction,
    operationId: string,
    ownerId: string,
    now = new Date(),
): Promise<void> {
    const [row] = await tx
        .select()
        .from(operations)
        .where(
            and(
                eq(operations.id, operationId),
                eq(operations.ownerId, ownerId),
            ),
        );
    if (!row || row.state !== 'running' || (await isInvalid(tx, row, now)))
        throw new PortraitDraftUnavailableError();
}

function validateContext(context: InterviewContext): void {
    if (Buffer.byteLength(JSON.stringify(context), 'utf8') > 135000)
        throw new PortraitInterviewResourceLimitError(
            'Interview context limit reached; review the portrait or begin a new interview.',
        );
}

/** Resume the question; confirmed items come exclusively from the current state,
 * never from an older generated proposal attached to this response. */
function resumeQuestion(
    value: PortraitInterviewerOutput,
): PortraitInterviewerOutput {
    return {
        message: value.message,
        topic: value.topic,
        options: value.options,
        multiSelect: value.multiSelect,
        ...(value.locale ? { locale: value.locale } : {}),
        ...(value.redirect ? { redirect: value.redirect } : {}),
    };
}
