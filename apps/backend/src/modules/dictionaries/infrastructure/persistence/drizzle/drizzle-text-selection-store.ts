import { recheckTextAiDispatch } from '../../../../text-ai/infrastructure/persistence/drizzle/text-ai-dispatch-guard';
import { TextAiSelectionUnavailableError } from '../../../../text-ai/application/text-ai-admission-participant';
import type { TextSelectionRequest } from '@languon/contracts';
import { EnqueueTextSelectionRequestSchema } from '@languon/contracts';
import { and, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { withActionBilling } from '../../../../ai-credits/infrastructure/persistence/drizzle/action-billing';
import { DrizzleAiCreditTransactionParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { usesLegacyAction } from '../../../../ai-credits/infrastructure/persistence/drizzle/legacy-action-accounting';
import { modelPricingTransaction } from '../../../../ai-credits/infrastructure/price-aware-transaction';
import type { TextAiAvailabilityPolicy as TextAiSelectionRolloutPolicy } from '../../../../text-ai/infrastructure/persistence/drizzle/text-ai-catalog-query';
import type {
    SelectionLease,
    TextSelectionStore,
} from '../../../application/ports/text-selection-store';
import type { DictionaryCardAuthoringProviderDelta } from '../../../domain/card-authoring';
import {
    selectionCardValues,
    TextSelectionError,
} from '../../../domain/text-selection';
import { dictionaryTextSelectionJobsTable as jobs } from './selection-card-schema';
import { settleSelectionAttempt } from './text-selection-accounting';
import { claimSelectionJob } from './text-selection-claim';
import { enqueueSelectionJob } from './text-selection-enqueue';
import {
    beginSelectionTransaction,
    finishSelectionJob,
    lockSelectionOwner,
    selectionJobView,
    selectionLeaseOwned,
} from './text-selection-lifecycle';
import {
    assertSelectionSource,
    type SelectionSourceOptions,
} from './text-selection-source';
import {
    saveSelectionCard,
    selectionTarget,
    type SelectionDatabase,
} from './text-selection-target';

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
            await beginSelectionTransaction(tx);
            await lockSelectionOwner(tx, ownerId);

            return enqueueSelectionJob(
                tx,
                this.options,
                () => this.now(),
                ownerId,
                request,
                hash,
                shareKey,
            );
        });
    }

    async read(ownerId: string, id: string) {
        const [job] = await this.db
            .select()
            .from(jobs)
            .where(and(eq(jobs.id, id), eq(jobs.ownerId, ownerId)));

        if (!job) throw new TextSelectionError('not_found');

        return withActionBilling(
            this.db,
            selectionJobView(job),
            job.id,
            job.ownerId,
        );
    }

    async cancel(ownerId: string, id: string) {
        return modelPricingTransaction(this.db, async (tx) => {
            await beginSelectionTransaction(tx);
            await lockSelectionOwner(tx, ownerId);
            const [job] = await tx
                .select()
                .from(jobs)
                .where(and(eq(jobs.id, id), eq(jobs.ownerId, ownerId)))
                .for('update');

            if (!job) throw new TextSelectionError('not_found');
            if (job.executionState === 'queued') {
                await finishSelectionJob(
                    tx,
                    { ...job, cancellationRequestedAt: this.now() },
                    'cancelled',
                    null,
                    this.now(),
                );
            } else if (job.executionState === 'running') {
                await tx
                    .update(jobs)
                    .set({
                        cancellationRequestedAt: this.now(),
                        failureCode: 'explicit_stop',
                        updatedAt: this.now(),
                    })
                    .where(eq(jobs.id, id));
            }

            const [result] = await tx
                .select()
                .from(jobs)
                .where(eq(jobs.id, id));

            return withActionBilling(
                tx,
                selectionJobView(result!),
                result!.id,
                result!.ownerId,
            );
        });
    }

    async claim(workerId: string) {
        return modelPricingTransaction(this.db, async (tx) => {
            await beginSelectionTransaction(tx);

            return claimSelectionJob(
                tx,
                this.options,
                () => this.now(),
                workerId,
            );
        });
    }

    async heartbeat(lease: SelectionLease) {
        return this.db.transaction(async (tx) => {
            await beginSelectionTransaction(tx);
            const now = this.now();
            const [job] = await tx
                .select()
                .from(jobs)
                .where(eq(jobs.id, lease.id))
                .for('update');

            if (
                !selectionLeaseOwned(job, lease, now) ||
                job!.cancellationRequestedAt
            )
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
            await beginSelectionTransaction(tx);
            const ownerActive = await lockSelectionOwner(
                tx,
                lease.ownerId,
                true,
            );
            const now = this.now();
            const [job] = await tx
                .select()
                .from(jobs)
                .where(eq(jobs.id, lease.id))
                .for('update');

            if (!selectionLeaseOwned(job, lease, now)) return false;
            if (!ownerActive || job!.cancellationRequestedAt) {
                await finishSelectionJob(tx, job!, 'cancelled', null, now);

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

            if (usesLegacyAction(job!.selectedExecutionSnapshot)) {
                try {
                    await recheckTextAiDispatch(tx, {
                        actionId: job!.id,
                        jobId: job!.id,
                        now,
                    });
                } catch (error) {
                    if (!(error instanceof TextAiSelectionUnavailableError))
                        throw error;
                    await finishSelectionJob(
                        tx,
                        job!,
                        'failed',
                        'model_unavailable',
                        now,
                    );

                    return false;
                }
            }

            if (!usesLegacyAction(job!.selectedExecutionSnapshot))
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
            await beginSelectionTransaction(tx);
            const ownerActive = await lockSelectionOwner(
                tx,
                lease.ownerId,
                true,
            );
            const now = this.now();
            const [job] = await tx
                .select()
                .from(jobs)
                .where(eq(jobs.id, lease.id))
                .for('update');

            if (!selectionLeaseOwned(job, lease, now)) return false;
            if (!ownerActive || job!.cancellationRequestedAt) {
                await finishSelectionJob(
                    tx,
                    job!,
                    'cancelled',
                    null,
                    now,
                    usage,
                );

                return false;
            }

            const values = selectionCardValues(lease.input, delta);
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

                // Canonical Source can collide even when the selected text does not.
                if (values.source !== lease.input.source)
                    await selectionTarget(
                        tx,
                        job!.ownerId,
                        job!.target!,
                        lease.input.sourceLanguage,
                        lease.input.targetLanguage,
                        values.source,
                        job!.confirmDuplicate,
                    );
            } catch (error) {
                await finishSelectionJob(
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
                values,
                confirmDuplicate: job!.confirmDuplicate,
                now,
            });

            await finishSelectionJob(tx, job!, 'completed', null, now, usage);
            await tx.update(jobs).set(result).where(eq(jobs.id, lease.id));

            return true;
        });
    }

    async fail(
        lease: SelectionLease,
        code: string,
        usage?: { inputTokens: number; outputTokens: number },
        retryDisposition?: 'conclusive-provider-failure',
    ) {
        await modelPricingTransaction(this.db, async (tx) => {
            await beginSelectionTransaction(tx);
            const ownerActive = await lockSelectionOwner(
                tx,
                lease.ownerId,
                true,
            );
            const now = this.now();
            const [job] = await tx
                .select()
                .from(jobs)
                .where(eq(jobs.id, lease.id))
                .for('update');

            if (!selectionLeaseOwned(job, lease, now)) return;
            if (
                ownerActive &&
                !job!.cancellationRequestedAt &&
                (code === 'provider_rate_limited' ||
                    (job!.selectedExecutionSnapshot?.routingAuthority &&
                        job!.attemptCount === 1 &&
                        retryDisposition === 'conclusive-provider-failure')) &&
                job!.attemptCount < job!.maxAttempts &&
                job!.expiresAt > now
            ) {
                // A typed rate-limit rejection is safe to retry. Timeouts and unknown dispatched
                // outcomes remain terminal because their provider work may already have executed.
                await settleSelectionAttempt(
                    tx,
                    job!,
                    now,
                    usage,
                    'failure',
                    false,
                );

                await tx
                    .update(jobs)
                    .set({
                        executionState: 'queued',
                        aiCreditProviderDispatchedAt: null,
                        workerId: null,
                        leaseDeadline: null,
                        heartbeatAt: null,
                        nextAttemptAt: new Date(now.getTime() + 1000),
                        updatedAt: now,
                    })
                    .where(eq(jobs.id, job!.id));

                return;
            }

            await finishSelectionJob(
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
            await beginSelectionTransaction(tx);
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
                    await finishSelectionJob(
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
