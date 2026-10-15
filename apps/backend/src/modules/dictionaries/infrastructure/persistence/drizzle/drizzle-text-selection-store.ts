import { createHash, randomUUID } from 'node:crypto';
import { and, eq, lt, or, sql } from 'drizzle-orm';
import type {
    TextSelectionJob,
    TextSelectionRequest,
} from '@languon/contracts';
import { EnqueueTextSelectionRequestSchema } from '@languon/contracts';
import { dictionaryTextSelectionJobsTable as jobs } from './selection-card-schema';
import {
    type SelectionDatabase,
    type SelectionTransaction,
    selectionTarget,
    saveSelectionCard,
} from './text-selection-target';
import {
    resolveSelectionSource,
    assertSelectionSource,
    type SelectionSourceOptions,
} from './text-selection-source';
import { resolveTextSelection } from '../../../../texts/domain/text';
import {
    selectionProviderInput,
    selectionCardValues,
    TextSelectionError,
} from '../../../domain/text-selection';
import type {
    TextSelectionStore,
    SelectionLease,
} from '../../../application/ports/text-selection-store';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    lockTextAiCapacity,
    readTextAiCapacity,
} from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { DrizzleTextAiAdmissionParticipant } from '../../../../text-ai/infrastructure/persistence/drizzle/text-ai-admission-participant';
import type { TextAiAvailabilityPolicy as TextAiSelectionRolloutPolicy } from '../../../../text-ai/infrastructure/persistence/drizzle/text-ai-catalog-query';
import { defaultTextAiProviderBudgetPolicy } from '../../../../text-ai/application/text-ai-provider-catalog';
import { modelPricingTransaction } from '../../../../ai-credits/infrastructure/price-aware-transaction';
import {
    reserveSelectionAttempt,
    settleSelectionAttempt,
    selectionBudget,
} from './text-selection-accounting';
import { DrizzleAiCreditTransactionParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import type { DictionaryCardAuthoringProviderDelta } from '../../../domain/card-authoring';
import { textAiProviderBudgetAllows } from '../../../../../infrastructure/text-ai/text-ai-capacity';

type Row = typeof jobs.$inferSelect;
const view = (j: Row): TextSelectionJob => ({
    id: j.id,
    state: j.executionState,
    failureCode: j.failureCode,
    dictionaryId: j.dictionaryId,
    cardId: j.cardId,
    createdAt: j.createdAt.toISOString(),
    updatedAt: j.updatedAt.toISOString(),
});
const terminalInput = {
    inputPayload: null,
    sourceAuthority: null,
    target: null,
    workerId: null,
    leaseDeadline: null,
    heartbeatAt: null,
};
export interface TextSelectionStoreOptions extends SelectionSourceOptions {
    selectionPolicy: TextAiSelectionRolloutPolicy;
    globalConcurrency: number;
    ownerConcurrency: number;
    leaseMs: number;
    clock?: () => Date;
    admissionsEnabled?: boolean;
}
export class DrizzleTextSelectionStore implements TextSelectionStore {
    constructor(
        private readonly db: SelectionDatabase,
        private readonly options: TextSelectionStoreOptions,
    ) {}
    private now() {
        return this.options.clock?.() ?? new Date();
    }
    private async lockOwner(
        tx: SelectionTransaction,
        ownerId: string,
        optional = false,
    ) {
        const [user] = await tx
            .select({ id: usersTable.id })
            .from(usersTable)
            .where(
                and(
                    eq(usersTable.id, ownerId),
                    eq(usersTable.status, 'active'),
                ),
            )
            .for('share');
        if (!user && !optional) throw new TextSelectionError('not_found');
        return !!user;
    }
    private async begin(tx: SelectionTransaction) {
        await tx.execute(
            sql`select set_config('languon.texts_execution_revision','1',true),set_config('languon.text_ai_selection_revision','1',true),set_config('languon.ai_credit_settlement_revision','1',true)`,
        );
        await lockTextAiCapacity(tx);
    }
    async enqueue(
        ownerId: string,
        raw: TextSelectionRequest,
        shareKey?: string,
    ) {
        const request = EnqueueTextSelectionRequestSchema.parse(raw);
        const hash = createHash('sha256')
            .update(JSON.stringify(request))
            .digest('hex');
        return modelPricingTransaction(this.db, async (tx) => {
            await this.begin(tx);
            await this.lockOwner(tx, ownerId);
            const [existing] = await tx
                .select()
                .from(jobs)
                .where(
                    and(
                        eq(jobs.ownerId, ownerId),
                        eq(jobs.operationId, request.operationId),
                    ),
                );
            if (existing) {
                if (existing.requestHash !== hash)
                    throw new TextSelectionError('idempotency_conflict');
                return view(existing);
            }
            if (this.options.admissionsEnabled === false)
                throw new TextSelectionError('provider_unavailable');
            const now = this.now(),
                source = await resolveSelectionSource(
                    tx,
                    this.options,
                    ownerId,
                    request.source,
                    shareKey,
                    now,
                );
            const occurrence = resolveTextSelection(
                source.alignment,
                request.selection,
                source,
            );
            const target = await selectionTarget(
                tx,
                ownerId,
                request.target,
                occurrence.sourceLanguage,
                occurrence.targetLanguage,
                occurrence.phrase,
                request.confirmDuplicate,
            );
            const input = selectionProviderInput(
                {
                    phrase: occurrence.phrase,
                    sentence: occurrence.sentence,
                    previousSentence: occurrence.previousSentence,
                    nextSentence: occurrence.nextSentence,
                    startOffset: occurrence.startOffset,
                    endOffset: occurrence.endOffset,
                    sourceLanguageTag: occurrence.sourceLanguage,
                    targetLanguageTag: occurrence.targetLanguage,
                },
                target.settings,
                target.translationContext,
            );
            const selected = await new DrizzleTextAiAdmissionParticipant(
                tx,
                this.options.selectionPolicy,
            ).resolve({
                userId: ownerId,
                format: 'text-selection-card:v1',
                now,
                legacyBudget: defaultTextAiProviderBudgetPolicy,
            });
            if (!selected.snapshot)
                throw new TextSelectionError('provider_unavailable');
            // UTF-8 bytes upper-bound tokens for the structured input; include fixed prompt/schema overhead.
            if (
                Buffer.byteLength(JSON.stringify(input), 'utf8') + 4096 >
                selected.budget.maxInputTokensPerAttempt
            )
                throw new TextSelectionError('model_input_too_large');
            const capacity = await readTextAiCapacity(tx, {
                actorId: ownerId,
                now,
                budget: selected.budget,
            });
            if (
                capacity.actorQueued >= 20 ||
                !textAiProviderBudgetAllows(
                    capacity.providerUsage,
                    true,
                    selected.budget,
                )
            )
                throw new TextSelectionError('capacity_exceeded');
            const credit = selected.snapshot.creditPricing;
            if (!credit) throw new TextSelectionError('provider_unavailable');
            const creditSummary =
                await new DrizzleAiCreditTransactionParticipant(
                    tx,
                ).accountSummary(ownerId, now);
            const [job] = await tx
                .insert(jobs)
                .values({
                    id: randomUUID(),
                    ownerId,
                    operationId: request.operationId,
                    requestHash: hash,
                    inputPayload: input,
                    sourceAuthority: source.authority,
                    sourceOwnerId: source.sourceOwnerId,
                    target: request.target,
                    confirmDuplicate: request.confirmDuplicate,
                    selectedExecutionSnapshot: selected.snapshot,
                    maxAttempts: 2,
                    executionRevisionId: selected.revisionId ?? null,
                    providerInputCostMicrosPerMillionTokens:
                        selected.budget.inputCostMicrosPerMillionTokens,
                    providerOutputCostMicrosPerMillionTokens:
                        selected.budget.outputCostMicrosPerMillionTokens,
                    providerMaxCostMicrosPerAttempt:
                        selected.budget.maxCostMicrosPerAttempt,
                    providerMaxInputTokensPerAttempt:
                        selected.budget.maxInputTokensPerAttempt,
                    providerMaxOutputTokensPerAttempt:
                        selected.budget.maxOutputTokensPerAttempt,
                    providerReservedCostMicros:
                        selected.budget.maxCostMicrosPerAttempt,
                    providerReservedInputTokens:
                        selected.budget.maxInputTokensPerAttempt,
                    providerReservedOutputTokens:
                        selected.budget.maxOutputTokensPerAttempt,
                    aiCreditAccounted: true,
                    aiCreditPolicyMode: creditSummary.policy.effectiveMode,
                    aiCreditMaxCreditsPerAttempt: credit.maxCreditsPerAttempt,
                    aiCreditInputCreditsPerMillionTokens:
                        credit.inputCreditsPerMillionTokens,
                    aiCreditOutputCreditsPerMillionTokens:
                        credit.outputCreditsPerMillionTokens,
                    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
                    createdAt: now,
                    updatedAt: now,
                    nextAttemptAt: now,
                })
                .returning();
            await reserveSelectionAttempt(tx, job!, 1, now);
            return view(job!);
        });
    }
    async read(ownerId: string, id: string) {
        const [job] = await this.db
            .select()
            .from(jobs)
            .where(and(eq(jobs.id, id), eq(jobs.ownerId, ownerId)));
        if (!job) throw new TextSelectionError('not_found');
        return view(job);
    }
    async cancel(ownerId: string, id: string) {
        return modelPricingTransaction(this.db, async (tx) => {
            await this.begin(tx);
            await this.lockOwner(tx, ownerId);
            const [job] = await tx
                .select()
                .from(jobs)
                .where(and(eq(jobs.id, id), eq(jobs.ownerId, ownerId)))
                .for('update');
            if (!job) throw new TextSelectionError('not_found');
            if (job.executionState === 'queued') {
                await this.terminal(tx, job, 'cancelled', null, this.now());
            } else if (job.executionState === 'running') {
                await tx
                    .update(jobs)
                    .set({
                        cancellationRequestedAt: this.now(),
                        updatedAt: this.now(),
                    })
                    .where(eq(jobs.id, id));
            }
            const [result] = await tx
                .select()
                .from(jobs)
                .where(eq(jobs.id, id));
            return view(result!);
        });
    }
    private owned(job: Row | undefined, lease: SelectionLease, now: Date) {
        return (
            !!job &&
            job.executionState === 'running' &&
            job.workerId === lease.workerId &&
            job.fencingToken === lease.fencingToken &&
            job.attemptCount === lease.attempt &&
            !!job.leaseDeadline &&
            job.leaseDeadline > now
        );
    }
    private async terminal(
        tx: SelectionTransaction,
        job: Row,
        state: 'failed' | 'cancelled' | 'completed',
        failureCode: string | null,
        now: Date,
        usage?: { inputTokens: number; outputTokens: number },
    ) {
        await settleSelectionAttempt(tx, job, now, usage);
        await tx
            .update(jobs)
            .set({
                ...terminalInput,
                executionState: state,
                failureCode,
                updatedAt: now,
            })
            .where(eq(jobs.id, job.id));
    }
    async claim(workerId: string) {
        return modelPricingTransaction(this.db, async (tx) => {
            await this.begin(tx);
            const now = this.now();
            const candidates = await tx
                .select()
                .from(jobs)
                .where(
                    or(
                        and(
                            eq(jobs.executionState, 'queued'),
                            lt(jobs.nextAttemptAt, new Date(now.getTime() + 1)),
                        ),
                        and(
                            eq(jobs.executionState, 'running'),
                            lt(jobs.leaseDeadline, now),
                        ),
                    ),
                )
                .orderBy(jobs.createdAt)
                .limit(20);
            for (const candidate of candidates) {
                const ownerActive = await this.lockOwner(
                    tx,
                    candidate.ownerId,
                    true,
                );
                const [job] = await tx
                    .select()
                    .from(jobs)
                    .where(eq(jobs.id, candidate.id))
                    .for('update');
                if (!job || !['queued', 'running'].includes(job.executionState))
                    continue;
                if (
                    job.executionState === 'running' &&
                    job.leaseDeadline &&
                    job.leaseDeadline > now
                )
                    continue;
                if (
                    !ownerActive ||
                    job.expiresAt <= now ||
                    job.cancellationRequestedAt
                ) {
                    await this.terminal(
                        tx,
                        job,
                        job.cancellationRequestedAt ? 'cancelled' : 'failed',
                        job.cancellationRequestedAt ? null : 'expired',
                        now,
                    );
                    continue;
                }
                if (
                    job.executionState === 'running' &&
                    job.aiCreditProviderDispatchedAt
                ) {
                    await this.terminal(
                        tx,
                        job,
                        'failed',
                        'worker_interrupted',
                        now,
                    );
                    continue;
                }
                try {
                    await assertSelectionSource(
                        tx,
                        this.options,
                        job.sourceAuthority!,
                        now,
                    );
                    await selectionTarget(
                        tx,
                        job.ownerId,
                        job.target!,
                        job.inputPayload!.sourceLanguage,
                        job.inputPayload!.targetLanguage,
                        job.inputPayload!.source,
                        job.confirmDuplicate,
                    );
                } catch {
                    await this.terminal(
                        tx,
                        job,
                        'failed',
                        'stale_content',
                        now,
                    );
                    continue;
                }
                const budget = selectionBudget(job),
                    capacity = await readTextAiCapacity(tx, {
                        actorId: job.ownerId,
                        now,
                        budget,
                    });
                if (
                    capacity.globalRunning >= this.options.globalConcurrency ||
                    capacity.actorRunning >= this.options.ownerConcurrency
                )
                    continue;
                const retry = job.providerReservationState !== 'active';
                if (
                    retry &&
                    !textAiProviderBudgetAllows(
                        capacity.providerUsage,
                        true,
                        budget,
                    )
                )
                    continue;
                const attempt = retry
                    ? job.attemptCount + 1
                    : Math.max(1, job.attemptCount);
                if (attempt > job.maxAttempts) {
                    await this.terminal(
                        tx,
                        job,
                        'failed',
                        'attempts_exhausted',
                        now,
                    );
                    continue;
                }
                if (retry) {
                    const credits = new DrizzleAiCreditTransactionParticipant(
                        tx,
                    );
                    const summary = await credits.accountSummary(
                        job.ownerId,
                        now,
                    );
                    if (
                        summary.policy.effectiveMode !==
                            job.aiCreditPolicyMode ||
                        (summary.policy.effectiveMode === 'limited' &&
                            summary.availableCredits <
                                BigInt(job.aiCreditMaxCreditsPerAttempt!))
                    ) {
                        await this.terminal(
                            tx,
                            job,
                            'failed',
                            'ai_credits_exhausted',
                            now,
                        );
                        continue;
                    }
                }
                const token = job.fencingToken + 1;
                await tx
                    .update(jobs)
                    .set({
                        executionState: 'running',
                        workerId,
                        fencingToken: token,
                        attemptCount: attempt,
                        providerReservationState: 'active',
                        providerReservationSettledAt: null,
                        leaseDeadline: new Date(
                            now.getTime() + this.options.leaseMs,
                        ),
                        heartbeatAt: now,
                        updatedAt: now,
                    })
                    .where(eq(jobs.id, job.id));
                if (retry) await reserveSelectionAttempt(tx, job, attempt, now);
                return {
                    id: job.id,
                    ownerId: job.ownerId,
                    workerId,
                    fencingToken: token,
                    attempt,
                    input: job.inputPayload!,
                    budget,
                    execution: job.selectedExecutionSnapshot,
                };
            }
            return null;
        });
    }
    async heartbeat(lease: SelectionLease) {
        return this.db.transaction(async (tx) => {
            await this.begin(tx);
            const now = this.now();
            const [job] = await tx
                .select()
                .from(jobs)
                .where(eq(jobs.id, lease.id))
                .for('update');
            if (!this.owned(job, lease, now) || job!.cancellationRequestedAt)
                return false;
            await tx
                .update(jobs)
                .set({
                    leaseDeadline: new Date(
                        now.getTime() + this.options.leaseMs,
                    ),
                    heartbeatAt: now,
                })
                .where(eq(jobs.id, lease.id));
            return true;
        });
    }
    async dispatch(lease: SelectionLease) {
        return modelPricingTransaction(this.db, async (tx) => {
            await this.begin(tx);
            const ownerActive = await this.lockOwner(tx, lease.ownerId, true);
            const now = this.now();
            const [job] = await tx
                .select()
                .from(jobs)
                .where(eq(jobs.id, lease.id))
                .for('update');
            if (!this.owned(job, lease, now)) return false;
            if (!ownerActive || job!.cancellationRequestedAt) {
                await this.terminal(tx, job!, 'cancelled', null, now);
                return false;
            }
            await assertSelectionSource(
                tx,
                this.options,
                job!.sourceAuthority!,
                now,
            );
            await selectionTarget(
                tx,
                job!.ownerId,
                job!.target!,
                lease.input.sourceLanguage,
                lease.input.targetLanguage,
                lease.input.source,
                job!.confirmDuplicate,
            );
            await new DrizzleAiCreditTransactionParticipant(
                tx,
            ).markProviderDispatched({
                dispatchedAt: now,
                ownerId: job!.ownerId,
                reservationId: job!.aiCreditReservationId!,
            });
            await tx
                .update(jobs)
                .set({ aiCreditProviderDispatchedAt: now })
                .where(eq(jobs.id, lease.id));
            return true;
        });
    }
    async complete(
        lease: SelectionLease,
        delta: DictionaryCardAuthoringProviderDelta,
        usage?: { inputTokens: number; outputTokens: number },
    ) {
        return modelPricingTransaction(this.db, async (tx) => {
            await this.begin(tx);
            const ownerActive = await this.lockOwner(tx, lease.ownerId, true);
            const now = this.now();
            const [job] = await tx
                .select()
                .from(jobs)
                .where(eq(jobs.id, lease.id))
                .for('update');
            if (!this.owned(job, lease, now)) return false;
            if (!ownerActive || job!.cancellationRequestedAt) {
                await this.terminal(tx, job!, 'cancelled', null, now, usage);
                return false;
            }
            try {
                await assertSelectionSource(
                    tx,
                    this.options,
                    job!.sourceAuthority!,
                    now,
                );
                await selectionTarget(
                    tx,
                    job!.ownerId,
                    job!.target!,
                    lease.input.sourceLanguage,
                    lease.input.targetLanguage,
                    lease.input.source,
                    job!.confirmDuplicate,
                );
            } catch (error) {
                await this.terminal(
                    tx,
                    job!,
                    'failed',
                    error instanceof TextSelectionError
                        ? error.code
                        : 'access_revoked',
                    now,
                    usage,
                );
                return false;
            }
            const result = await saveSelectionCard(tx, {
                ownerId: job!.ownerId,
                target: job!.target!,
                sourceLanguage: lease.input.sourceLanguage,
                targetLanguage: lease.input.targetLanguage,
                values: selectionCardValues(lease.input, delta),
                confirmDuplicate: job!.confirmDuplicate,
                now,
            });
            await this.terminal(tx, job!, 'completed', null, now, usage);
            await tx.update(jobs).set(result).where(eq(jobs.id, lease.id));
            return true;
        });
    }
    async fail(
        lease: SelectionLease,
        code: string,
        usage?: { inputTokens: number; outputTokens: number },
    ) {
        await modelPricingTransaction(this.db, async (tx) => {
            await this.begin(tx);
            const ownerActive = await this.lockOwner(tx, lease.ownerId, true);
            const now = this.now();
            const [job] = await tx
                .select()
                .from(jobs)
                .where(eq(jobs.id, lease.id))
                .for('update');
            if (!this.owned(job, lease, now)) return;
            if (
                ownerActive &&
                !job!.cancellationRequestedAt &&
                code === 'provider_rate_limited' &&
                job!.attemptCount < job!.maxAttempts &&
                job!.expiresAt > now
            ) {
                // A typed rate-limit rejection is safe to retry. Timeouts and unknown dispatched
                // outcomes remain terminal because their provider work may already have executed.
                await settleSelectionAttempt(
                    tx,
                    job!,
                    now,
                    usage ?? { inputTokens: 0, outputTokens: 0 },
                );
                await tx
                    .update(jobs)
                    .set({
                        executionState: 'queued',
                        workerId: null,
                        leaseDeadline: null,
                        heartbeatAt: null,
                        nextAttemptAt: new Date(now.getTime() + 1000),
                        updatedAt: now,
                    })
                    .where(eq(jobs.id, job!.id));
                return;
            }
            await this.terminal(
                tx,
                job!,
                !ownerActive || job!.cancellationRequestedAt
                    ? 'cancelled'
                    : 'failed',
                !ownerActive || job!.cancellationRequestedAt ? null : code,
                now,
                usage,
            );
        });
    }
    async releaseWorkerLeases(workerId: string) {
        await modelPricingTransaction(this.db, async (tx) => {
            await this.begin(tx);
            const now = this.now();
            const running = await tx
                .select()
                .from(jobs)
                .where(
                    and(
                        eq(jobs.executionState, 'running'),
                        eq(jobs.workerId, workerId),
                    ),
                )
                .for('update');
            for (const job of running) {
                if (job.aiCreditProviderDispatchedAt)
                    await this.terminal(
                        tx,
                        job,
                        'failed',
                        'worker_interrupted',
                        now,
                    );
                else
                    await tx
                        .update(jobs)
                        .set({
                            executionState: 'queued',
                            workerId: null,
                            leaseDeadline: null,
                            heartbeatAt: null,
                            fencingToken: job.fencingToken + 1,
                            updatedAt: now,
                        })
                        .where(eq(jobs.id, job.id));
            }
        });
    }
}
