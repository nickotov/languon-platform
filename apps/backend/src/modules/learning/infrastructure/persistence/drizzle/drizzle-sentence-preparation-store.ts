import type { LegacyActionSnapshot } from '../../../../ai-credits/infrastructure/persistence/drizzle/legacy-action-accounting';
import { settleLegacyAction } from '../../../../ai-credits/infrastructure/persistence/drizzle/legacy-action-accounting';
import { formatCreditMilli } from '../../../../ai-credits/domain/exact-credit-amount';
import {
    aiCreditActionsTable as accountingActions,
    aiCreditActionAttemptsTable as accountingAttempts,
} from '../../../../ai-credits/infrastructure/persistence/drizzle/action-accounting-schema';
import { modelPricingTransaction } from '../../../../ai-credits/infrastructure/price-aware-transaction';
import { createHash, randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import {
    SentenceExerciseSchema,
    type SentencePreparation,
    type SentencePreparationBatch,
    type SentencePreparationStartRequest,
    type SentencePreparationCommandRequest,
} from '@languon/contracts';
import type { SentencePreparationStore } from '../../../application/ports/sentence-preparation-store';
import type { SentenceContext } from '../../../application/ports/sentence-practice-store';
import type { LearningAccess } from '../../../application/ports/learning-store';
import { sentenceLanguageMatches } from '../../../domain/sentence-language';
import { partitionSentencePreparation } from '../../../domain/sentence-preparation-policy';
import {
    SentenceCapacityUnavailableError,
    SentenceConflictError,
    SentenceCreditsExhaustedError,
    SentenceModelUnavailableError,
    SentenceUnavailableError,
} from '../../../domain/sentence-errors';
import { lockTextAiCapacity } from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { pruneSentenceLibrarySnapshots } from './drizzle-sentence-library-store';
import {
    sentenceExercisesTable as exercises,
    sentenceAiJobsTable as jobs,
    sentenceExerciseEntriesTable as exerciseEntries,
} from './sentence-schema';
import {
    sentencePersonalVisibilityTable as personal,
    sentenceGlobalVisibilityTable as global,
} from './sentence-library-schema';
import {
    sentencePreparationsTable as preparations,
    sentencePreparationBatchesTable as batches,
    sentencePreparationChildrenTable as children,
    sentencePreparationCommandsTable as commands,
    sentencePreparationActionsTable as parentActions,
} from './sentence-preparation-schema';
import {
    authorizeSentence,
    sentenceLearner,
    sentenceCandidates,
    sentenceExerciseEntries,
    isSentenceCurrent,
    lockSentenceLearner,
    type SentenceDatabase,
    type SentenceTransaction,
} from './sentence-persistence-support';
type Preparation = typeof preparations.$inferSelect;
type Batch = typeof batches.$inferSelect;
export interface SentencePreparationAdmissionRequest {
    preparationId: string;
    batchId: string;
    coordinatorFence: bigint;
}
export interface SentencePreparationPersistencePolicy {
    authorizeAction(
        tx: SentenceTransaction,
        access: LearningAccess,
        request: {
            actionId: string;
            operationId: string;
            fingerprint: string;
            inputPayload: unknown;
        },
        context: SentenceContext,
    ): Promise<{ snapshot: LegacyActionSnapshot; revisionId: string }>;
    admitGeneration(
        tx: SentenceTransaction,
        access: LearningAccess,
        request: SentencePreparationAdmissionRequest,
        context: SentenceContext,
    ): Promise<{ jobId: string }>;
}
function hash(input: unknown) {
    return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}
function accessFor(row: Preparation): LearningAccess {
    return row.authority.kind === 'owner'
        ? {
              kind: 'owner',
              dictionaryId: row.dictionaryId,
              learnerId: row.learnerId,
          }
        : { ...row.authority, learnerId: row.learnerId };
}
function covered(batch: Batch) {
    return new Set(batch.manifest.flatMap((item) => item.entryIds));
}
function presentBatch(batch: Batch): SentencePreparationBatch {
    const ids = covered(batch);
    return {
        id: batch.id,
        entryIds: batch.entries.map((entry) => entry.entryId),
        preparedEntryIds: batch.entries
            .filter((entry) => ids.has(entry.entryId))
            .map((entry) => entry.entryId),
        exerciseIds: batch.manifest.map((item) => item.exerciseId),
        state:
            ids.size === batch.entries.length
                ? 'ready'
                : ids.size
                  ? 'partial'
                  : 'pending',
    };
}
/** One explicit learner action owns the hold and every background child call. */
export class DrizzleSentencePreparationStore implements SentencePreparationStore {
    constructor(
        private readonly database: SentenceDatabase,
        private readonly policy: SentencePreparationPersistencePolicy,
    ) {}
    private async authorizeParent(
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
        const admitted = await this.policy.authorizeAction(
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
    private async settleParent(
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
    private async parentAvailable(
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
    private async rows(tx: SentenceTransaction, id: string) {
        return tx
            .select()
            .from(batches)
            .where(eq(batches.preparationId, id))
            .orderBy(asc(batches.ordinal));
    }
    private async present(
        tx: SentenceTransaction,
        row: Preparation,
        visiblePartitions?: Batch[],
    ): Promise<SentencePreparation> {
        const partitions = visiblePartitions ?? (await this.rows(tx, row.id));
        const [parent] = row.currentActionId
            ? await tx
                  .select()
                  .from(accountingActions)
                  .where(eq(accountingActions.id, row.currentActionId))
            : [];
        const calls = parent
            ? await tx
                  .select()
                  .from(accountingAttempts)
                  .where(eq(accountingAttempts.actionId, parent.id))
            : [];
        const remainingOutputTokens = parent
            ? Math.max(
                  0,
                  parent.outputLimit -
                      calls.reduce(
                          (sum, call) =>
                              sum + (call.outputTokens ?? call.outputLimit),
                          0,
                      ),
              )
            : 0;

        return {
            ...(parent
                ? {
                      billing: {
                          state:
                              parent.funding !== 'customer'
                                  ? ('free' as const)
                                  : parent.state === 'active'
                                    ? ('held' as const)
                                    : parent.chargedMilli
                                      ? ('charged' as const)
                                      : ('released' as const),
                          heldCredits: formatCreditMilli(parent.heldMilli),
                          chargedCredits:
                              parent.chargedMilli === null
                                  ? null
                                  : formatCreditMilli(parent.chargedMilli),
                          measurement: parent.measurement,
                      },
                      remainingOutputTokens,
                      requiresNewBudget:
                          parent.state !== 'active' ||
                          parent.deadlineAt <= new Date() ||
                          calls.length >= 5 ||
                          remainingOutputTokens === 0,
                  }
                : {}),
            id: row.id,
            dictionaryId: row.dictionaryId,
            direction: row.direction,
            mode: row.mode,
            state: row.state,
            pauseReason: row.pauseReason,
            eligibleCount: partitions.reduce(
                (sum, batch) => sum + batch.entries.length,
                0,
            ),
            preparedCount: partitions.reduce(
                (sum, batch) => sum + covered(batch).size,
                0,
            ),
            reusedExerciseCount: partitions.reduce(
                (sum, batch) =>
                    sum +
                    batch.manifest.filter((item) => item.origin === 'saved')
                        .length,
                0,
            ),
            generatedExerciseCount: partitions.reduce(
                (sum, batch) =>
                    sum +
                    batch.manifest.filter((item) => item.origin === 'generated')
                        .length,
                0,
            ),
            initialBatch: partitions[0] ? presentBatch(partitions[0]) : null,
            batchCount: partitions.length,
            activeJobId: row.activeJobId,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
        };
    }
    private async visible(
        tx: SentenceTransaction,
        learnerId: string,
        exerciseId: string,
    ) {
        const [hidden] = await tx
            .select()
            .from(personal)
            .where(
                and(
                    eq(personal.learnerId, learnerId),
                    eq(personal.exerciseId, exerciseId),
                    sql`${personal.archivedAt} is not null`,
                ),
            );
        const [globallyHidden] = await tx
            .select()
            .from(global)
            .where(
                and(
                    eq(global.exerciseId, exerciseId),
                    sql`${global.archivedAt} is not null`,
                ),
            );
        return !hidden && !globallyHidden;
    }
    private async fresh(
        tx: SentenceTransaction,
        row: Preparation,
        partitions: Batch[],
    ) {
        if (!partitions.length) return false;
        const { dictionary } = await authorizeSentence(tx, accessFor(row));
        const source =
            row.direction === 'source-to-target'
                ? dictionary.sourceLanguageTag
                : dictionary.targetLanguageTag;
        const target =
            row.direction === 'source-to-target'
                ? dictionary.targetLanguageTag
                : dictionary.sourceLanguageTag;
        if (source !== row.sourceLanguage || target !== row.targetLanguage)
            return false;
        const current = (
            await sentenceCandidates(
                tx,
                row.dictionaryId,
                { type: 'all' },
                row.direction,
                row.learnerId,
            )
        ).candidates;
        return partitions.every((batch) =>
            batch.entries.every((entry) =>
                current.some(
                    (candidate) =>
                        candidate.entryId === entry.entryId &&
                        candidate.learningVersion === entry.learningVersion &&
                        candidate.sourceText === entry.sourceText &&
                        candidate.targetText === entry.targetText,
                ),
            ),
        );
    }
    private async refreshManifest(
        tx: SentenceTransaction,
        row: Preparation,
        batch: Batch,
        persist = true,
    ) {
        const manifest: Batch['manifest'] = [];
        for (const item of batch.manifest) {
            if (
                (await this.visible(tx, row.learnerId, item.exerciseId)) &&
                (await isSentenceCurrent(tx, item.exerciseId))
            )
                manifest.push(item);
        }
        if (manifest.length !== batch.manifest.length) {
            if (persist)
                await tx
                    .update(batches)
                    .set({
                        manifest,
                        ...(row.mode !== 'new-only'
                            ? { reviewed: false, scanCursor: null }
                            : {}),
                    })
                    .where(eq(batches.id, batch.id));
            batch.manifest = manifest;
            if (row.mode !== 'new-only') {
                batch.reviewed = false;
                batch.scanCursor = null;
            }
        }
    }
    async start(
        access: LearningAccess,
        input: SentencePreparationStartRequest,
        context: SentenceContext,
    ) {
        context.signal.throwIfAborted();
        return modelPricingTransaction(this.database, async (tx) => {
            const { dictionary } = await authorizeSentence(tx, access, true);
            const learnerId = sentenceLearner(access);
            await lockSentenceLearner(tx, learnerId);
            const fingerprint = hash({
                ...input,
                initialRoundScope:
                    input.initialRoundScope.type === 'manual'
                        ? {
                              type: 'manual',
                              entryIds: [
                                  ...input.initialRoundScope.entryIds,
                              ].sort(),
                          }
                        : input.initialRoundScope,
            });
            const [previous] = await tx
                .select()
                .from(preparations)
                .where(
                    and(
                        eq(preparations.learnerId, learnerId),
                        eq(preparations.operationId, input.operationId),
                    ),
                );
            if (previous) {
                if (
                    previous.fingerprint !== fingerprint ||
                    previous.dictionaryId !== dictionary.id
                )
                    throw new SentenceConflictError('operation_conflict');
                return this.present(tx, previous);
            }
            await this.pruneInactive(tx, learnerId, context.now);
            const [active] = await tx
                .select({ id: preparations.id })
                .from(preparations)
                .where(
                    and(
                        eq(preparations.learnerId, learnerId),
                        eq(preparations.dictionaryId, dictionary.id),
                        eq(preparations.direction, input.direction),
                        inArray(preparations.state, [
                            'queued',
                            'running',
                            'stopping',
                        ]),
                    ),
                )
                .limit(1);
            if (active) throw new SentenceConflictError('operation_conflict');
            const contentRows = await tx
                .select({ id: preparations.id })
                .from(preparations)
                .where(
                    and(
                        eq(preparations.learnerId, learnerId),
                        sql`exists(select 1 from ${batches} b where b.preparation_id=${preparations.id})`,
                    ),
                )
                .limit(20);
            if (contentRows.length >= 20)
                throw new SentenceCapacityUnavailableError();
            const all = (
                await sentenceCandidates(
                    tx,
                    dictionary.id,
                    { type: 'all' },
                    input.direction,
                    learnerId,
                )
            ).candidates;
            const initial = (
                await sentenceCandidates(
                    tx,
                    dictionary.id,
                    input.initialRoundScope,
                    input.direction,
                    learnerId,
                )
            ).candidates.slice(0, 100);
            const sourceLanguage =
                input.direction === 'source-to-target'
                    ? dictionary.sourceLanguageTag
                    : dictionary.targetLanguageTag;
            const targetLanguage =
                input.direction === 'source-to-target'
                    ? dictionary.targetLanguageTag
                    : dictionary.sourceLanguageTag;
            const [row] = await tx
                .insert(preparations)
                .values({
                    id: randomUUID(),
                    learnerId,
                    dictionaryId: dictionary.id,
                    operationId: input.operationId,
                    fingerprint,
                    direction: input.direction,
                    mode: input.mode,
                    authority:
                        access.kind === 'owner'
                            ? { kind: 'owner' }
                            : {
                                  kind: 'shared',
                                  shareId: access.shareId,
                                  keyDigest: access.keyDigest,
                              },
                    sourceLanguage,
                    targetLanguage,
                    state: all.length ? 'queued' : 'completed',
                    createdAt: context.now,
                    updatedAt: context.now,
                })
                .returning();
            const partitions = partitionSentencePreparation(
                all,
                initial.map((entry) => entry.entryId),
            );
            if (partitions.length)
                await tx.insert(batches).values(
                    partitions.map((entries, ordinal) => ({
                        id: randomUUID(),
                        preparationId: row!.id,
                        ordinal,
                        entries: entries.map(
                            ({
                                entryId,
                                learningVersion,
                                sourceText,
                                targetText,
                            }) => ({
                                entryId,
                                learningVersion,
                                sourceText,
                                targetText,
                            }),
                        ),
                        manifest: [],
                    })),
                );
            if (all.length && input.mode !== 'review-only') {
                await this.authorizeParent(
                    tx,
                    row!,
                    input.operationId,
                    fingerprint,
                    partitions,
                    context,
                );
                const [admitted] = await tx
                    .select()
                    .from(preparations)
                    .where(eq(preparations.id, row!.id));
                return this.present(tx, admitted!);
            }
            context.signal.throwIfAborted();
            return this.present(tx, row!);
        });
    }
    async get(access: LearningAccess, id: string, context: SentenceContext) {
        context.signal.throwIfAborted();
        return modelPricingTransaction(this.database, async (tx) => {
            const { dictionary } = await authorizeSentence(tx, access);
            const [row] = await tx
                .select()
                .from(preparations)
                .where(
                    and(
                        eq(preparations.id, id),
                        eq(preparations.dictionaryId, dictionary.id),
                        eq(preparations.learnerId, sentenceLearner(access)),
                    ),
                );
            if (!row) throw new SentenceUnavailableError();
            const partitions = await this.rows(tx, id);
            for (const batch of partitions)
                await this.refreshManifest(tx, row, batch, false);
            const current = await this.fresh(tx, row, partitions);
            return this.present(
                tx,
                current
                    ? row
                    : { ...row, state: 'paused', pauseReason: 'stale' },
                partitions,
            );
        });
    }
    async command(
        access: LearningAccess,
        id: string,
        input: SentencePreparationCommandRequest,
        context: SentenceContext,
    ) {
        context.signal.throwIfAborted();
        return modelPricingTransaction(this.database, async (tx) => {
            await lockTextAiCapacity(tx);
            const { dictionary } = await authorizeSentence(tx, access, true);
            const learnerId = sentenceLearner(access);
            await lockSentenceLearner(tx, learnerId);
            const [row] = await tx
                .select()
                .from(preparations)
                .where(
                    and(
                        eq(preparations.id, id),
                        eq(preparations.dictionaryId, dictionary.id),
                        eq(preparations.learnerId, learnerId),
                    ),
                )
                .for('update');
            if (!row) throw new SentenceUnavailableError();
            const [receipt] = await tx
                .select()
                .from(commands)
                .where(
                    and(
                        eq(commands.learnerId, learnerId),
                        eq(commands.operationId, input.operationId),
                    ),
                );
            if (receipt) {
                if (
                    receipt.preparationId !== id ||
                    receipt.action !== input.action
                )
                    throw new SentenceConflictError('operation_conflict');
                return this.present(tx, row);
            }
            if (input.action === 'resume' || input.action === 'continue') {
                if (
                    row.state !== 'paused' ||
                    row.pauseReason === 'access' ||
                    row.pauseReason === 'stale'
                )
                    throw new SentenceConflictError('stale_content');
                if (!(await this.fresh(tx, row, await this.rows(tx, id))))
                    throw new SentenceConflictError('stale_content');
                const [otherActive] = await tx
                    .select({ id: preparations.id })
                    .from(preparations)
                    .where(
                        and(
                            eq(preparations.learnerId, learnerId),
                            eq(preparations.dictionaryId, row.dictionaryId),
                            eq(preparations.direction, row.direction),
                            sql`${preparations.id}<>${row.id}::uuid`,
                            inArray(preparations.state, [
                                'queued',
                                'running',
                                'stopping',
                            ]),
                        ),
                    )
                    .limit(1);
                if (otherActive)
                    throw new SentenceConflictError('operation_conflict');
                const available =
                    row.mode === 'review-only' ||
                    (await this.parentAvailable(tx, row, context.now));
                if (input.action === 'resume' && !available)
                    throw new SentenceConflictError('operation_conflict');
                if (input.action === 'continue') {
                    if (available || row.mode === 'review-only')
                        throw new SentenceConflictError('operation_conflict');
                    await this.settleParent(tx, row, context.now);
                    const [old] = row.currentActionId
                        ? await tx
                              .select()
                              .from(accountingActions)
                              .where(
                                  eq(accountingActions.id, row.currentActionId),
                              )
                        : [];
                    if (old?.state === 'active')
                        throw new SentenceConflictError('operation_conflict');
                    await this.authorizeParent(
                        tx,
                        row,
                        input.operationId,
                        hash({
                            preparationId: row.id,
                            operationId: input.operationId,
                            action: 'continue',
                        }),
                        (await this.rows(tx, id)).map((batch) =>
                            batch.entries.filter(
                                (entry) => !covered(batch).has(entry.entryId),
                            ),
                        ),
                        context,
                    );
                }
                await tx
                    .update(preparations)
                    .set({
                        state: 'queued',
                        pauseReason: null,
                        updatedAt: context.now,
                    })
                    .where(eq(preparations.id, id));
            } else if (row.state !== 'completed' && row.state !== 'failed') {
                await tx
                    .update(preparations)
                    .set({
                        state: row.activeJobId ? 'stopping' : 'paused',
                        pauseReason: 'user',
                        updatedAt: context.now,
                    })
                    .where(eq(preparations.id, id));
            }
            await tx.insert(commands).values({
                learnerId,
                operationId: input.operationId,
                preparationId: id,
                action: input.action,
                authorizationActionId: row.currentActionId,
                createdAt: context.now,
            });
            if (input.action === 'stop') {
                if (row.activeJobId)
                    await tx
                        .update(jobs)
                        .set({
                            cancellationRequestedAt: context.now,
                            updatedAt: context.now,
                        })
                        .where(
                            and(
                                eq(jobs.id, row.activeJobId),
                                inArray(jobs.executionState, [
                                    'queued',
                                    'running',
                                ]),
                            ),
                        );
                else await this.settleParent(tx, row, context.now, true);
            }
            const [updated] = await tx
                .select()
                .from(preparations)
                .where(eq(preparations.id, id));
            return this.present(tx, updated!);
        });
    }
    async resolvePreparedBatch(
        tx: SentenceTransaction,
        access: LearningAccess,
        id: string,
        context: SentenceContext,
    ) {
        context.signal.throwIfAborted();
        const { dictionary } = await authorizeSentence(tx, access);
        const [batch] = await tx
            .select()
            .from(batches)
            .where(eq(batches.id, id));
        if (!batch) throw new SentenceUnavailableError();
        const [row] = await tx
            .select()
            .from(preparations)
            .where(
                and(
                    eq(preparations.id, batch.preparationId),
                    eq(preparations.dictionaryId, dictionary.id),
                    eq(preparations.learnerId, sentenceLearner(access)),
                ),
            );
        if (!row) throw new SentenceUnavailableError();
        if (row.pauseReason === 'stale' || row.pauseReason === 'access')
            throw new SentenceConflictError('stale_content');
        if (!(await this.fresh(tx, row, [batch])))
            throw new SentenceConflictError('stale_content');
        await this.refreshManifest(tx, row, batch, false);
        return {
            ...presentBatch(batch),
            direction: row.direction,
            preparationId: row.id,
        };
    }
    async batch(access: LearningAccess, id: string, context: SentenceContext) {
        const {
            direction: _direction,
            preparationId: _preparationId,
            ...batch
        } = await modelPricingTransaction(this.database, (tx) =>
            this.resolvePreparedBatch(tx, access, id, context),
        );
        return batch;
    }
    async listBatches(
        access: LearningAccess,
        id: string,
        query: { offset: number; limit: number },
        context: SentenceContext,
    ) {
        context.signal.throwIfAborted();
        return modelPricingTransaction(this.database, async (tx) => {
            const { dictionary } = await authorizeSentence(tx, access);
            const [row] = await tx
                .select()
                .from(preparations)
                .where(
                    and(
                        eq(preparations.id, id),
                        eq(preparations.dictionaryId, dictionary.id),
                        eq(preparations.learnerId, sentenceLearner(access)),
                    ),
                );
            if (!row) throw new SentenceUnavailableError();
            const page = await tx
                .select()
                .from(batches)
                .where(eq(batches.preparationId, id))
                .orderBy(asc(batches.ordinal))
                .offset(query.offset)
                .limit(query.limit + 1);
            const items: SentencePreparationBatch[] = [];
            for (const batch of page.slice(0, query.limit)) {
                await this.refreshManifest(tx, row, batch, false);
                items.push(presentBatch(batch));
            }
            return {
                items,
                nextOffset:
                    page.length > query.limit
                        ? query.offset + query.limit
                        : null,
            };
        });
    }
    private async pruneInactive(
        tx: SentenceTransaction,
        learnerId: string,
        now: Date,
    ) {
        const deadline = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const expired = await tx
            .select()
            .from(preparations)
            .where(
                and(
                    eq(preparations.learnerId, learnerId),
                    sql`${preparations.activeJobId} is null`,
                    sql`not exists(select 1 from ${children} c join ${jobs} j on j.id=c.job_id where c.preparation_id=${preparations.id} and (j.execution_state in ('queued','running') or j.provider_reservation_state='active'))`,
                    sql`${preparations.updatedAt}<${deadline.toISOString()}::timestamptz`,
                    sql`(${preparations.state} in ('completed','failed') or (${preparations.state}='paused' and ${preparations.pauseReason} in ('stale','access')))`,
                    sql`exists(select 1 from ${batches} b where b.preparation_id=${preparations.id})`,
                ),
            )
            .orderBy(asc(preparations.updatedAt))
            .limit(1)
            .for('update');
        for (const row of expired) {
            const ids = await tx
                .select({ id: batches.id })
                .from(batches)
                .where(eq(batches.preparationId, row.id))
                .orderBy(asc(batches.ordinal))
                .limit(100);
            if (ids.length)
                await tx.delete(batches).where(
                    inArray(
                        batches.id,
                        ids.map((item) => item.id),
                    ),
                );
            // A content-free header preserves the operation identity after bounded pruning.
            await tx
                .update(preparations)
                .set({
                    state: 'paused',
                    pauseReason: 'stale',
                    authority: { kind: 'owner' },
                })
                .where(eq(preparations.id, row.id));
        }
    }
    async tick(context: SentenceContext): Promise<boolean> {
        context.signal.throwIfAborted();
        await modelPricingTransaction(this.database, (tx) =>
            pruneSentenceLibrarySnapshots(tx, context.now),
        );
        const deadline = new Date(
            context.now.getTime() - 7 * 24 * 60 * 60 * 1000,
        );
        const [expired] = await this.database
            .select({ learnerId: preparations.learnerId })
            .from(preparations)
            .where(
                and(
                    sql`${preparations.activeJobId} is null`,
                    sql`not exists(select 1 from ${children} c join ${jobs} j on j.id=c.job_id where c.preparation_id=${preparations.id} and (j.execution_state in ('queued','running') or j.provider_reservation_state='active'))`,
                    sql`${preparations.updatedAt}<${deadline.toISOString()}::timestamptz`,
                    sql`(${preparations.state} in ('completed','failed') or (${preparations.state}='paused' and ${preparations.pauseReason} in ('stale','access')))`,
                    sql`exists(select 1 from ${batches} b where b.preparation_id=${preparations.id})`,
                ),
            )
            .orderBy(asc(preparations.updatedAt), asc(preparations.id))
            .limit(1);
        if (expired)
            await modelPricingTransaction(this.database, async (tx) => {
                await lockSentenceLearner(tx, expired.learnerId);
                await this.pruneInactive(tx, expired.learnerId, context.now);
            });
        // Begin with the compact active/deadline index; never scan settled preparation history.
        const [expiredParent] = await this.database
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
            .orderBy(
                asc(accountingActions.deadlineAt),
                asc(accountingActions.id),
            )
            .limit(1);
        const [candidate] = expiredParent
            ? [expiredParent.preparation]
            : await this.database
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
        if (!candidate) return !!expired;
        return modelPricingTransaction(this.database, async (tx) => {
            await lockTextAiCapacity(tx);
            // Actor/dictionary locks precede the preparation row, matching normal admission.
            let accessValid = true;
            try {
                await authorizeSentence(tx, accessFor(candidate), true);
            } catch (error) {
                if (!(error instanceof SentenceUnavailableError)) throw error;
                accessValid = false;
            }
            await lockSentenceLearner(tx, candidate.learnerId);
            const [row] = await tx
                .select()
                .from(preparations)
                .where(
                    and(
                        eq(preparations.id, candidate.id),
                        inArray(preparations.state, [
                            'queued',
                            'running',
                            'stopping',
                            'paused',
                        ]),
                    ),
                )
                .for('update');
            if (!row) return false;
            const pause = async (
                pauseReason: NonNullable<Preparation['pauseReason']>,
            ) => {
                await tx
                    .update(preparations)
                    .set({
                        state: row.activeJobId ? 'stopping' : 'paused',
                        pauseReason,
                        updatedAt: context.now,
                    })
                    .where(eq(preparations.id, row.id));
                if (row.activeJobId)
                    await tx
                        .update(jobs)
                        .set({
                            cancellationRequestedAt: context.now,
                            updatedAt: context.now,
                        })
                        .where(
                            and(
                                eq(jobs.id, row.activeJobId),
                                inArray(jobs.executionState, [
                                    'queued',
                                    'running',
                                ]),
                            ),
                        );
            };
            const partitions = await this.rows(tx, row.id);
            if (!accessValid) {
                await pause('access');
            } else if (!(await this.fresh(tx, row, partitions))) {
                await pause('stale');
            }
            if (row.activeJobId) {
                const [job] = await tx
                    .select()
                    .from(jobs)
                    .where(eq(jobs.id, row.activeJobId));
                if (job && ['queued', 'running'].includes(job.executionState)) {
                    await tx
                        .update(preparations)
                        .set({ updatedAt: context.now })
                        .where(eq(preparations.id, row.id));
                    return true;
                }
                if (
                    job?.executionState === 'completed' &&
                    job.resultExerciseId
                ) {
                    const [child] = await tx
                        .select()
                        .from(children)
                        .where(eq(children.jobId, job.id));
                    const batch = partitions.find(
                        (item) => item.id === child?.batchId,
                    );
                    if (
                        batch &&
                        (await this.visible(
                            tx,
                            row.learnerId,
                            job.resultExerciseId,
                        ))
                    ) {
                        const linked = await sentenceExerciseEntries(
                            tx,
                            job.resultExerciseId,
                        );
                        if (
                            linked.length &&
                            linked.every((entry) =>
                                batch.entries.some(
                                    (candidate) =>
                                        candidate.entryId === entry.entryId &&
                                        candidate.learningVersion ===
                                            entry.learningVersion,
                                ),
                            )
                        ) {
                            batch.manifest.push({
                                exerciseId: job.resultExerciseId,
                                entryIds: linked.map((entry) => entry.entryId),
                                origin: 'generated',
                            });
                            await tx
                                .update(batches)
                                .set({ manifest: batch.manifest })
                                .where(eq(batches.id, batch.id));
                        }
                    }
                }
                const [current] = await tx
                    .select()
                    .from(preparations)
                    .where(eq(preparations.id, row.id));
                const stopping = current?.state === 'stopping';
                const failed =
                    !job ||
                    job.executionState === 'failed' ||
                    job.executionState === 'cancelled';
                if (stopping || failed)
                    await this.settleParent(
                        tx,
                        row,
                        context.now,
                        stopping && current!.pauseReason === 'user',
                    );
                await tx
                    .update(preparations)
                    .set({
                        activeJobId: null,
                        state: stopping || failed ? 'paused' : 'running',
                        pauseReason: stopping
                            ? current!.pauseReason
                            : failed
                              ? job?.failureCategory === 'credits_exhausted'
                                  ? 'credits'
                                  : 'provider'
                              : null,
                        updatedAt: context.now,
                    })
                    .where(eq(preparations.id, row.id));
                return true;
            }
            if (row.currentActionId) {
                const [parent] = await tx
                    .select()
                    .from(accountingActions)
                    .where(eq(accountingActions.id, row.currentActionId));
                if (
                    parent?.state === 'active' &&
                    parent.deadlineAt <= context.now
                ) {
                    await this.settleParent(tx, row, context.now);
                    await pause('budget');
                    return true;
                }
            }
            const [currentPreparation] = await tx
                .select()
                .from(preparations)
                .where(eq(preparations.id, row.id));
            const lifecycleCancelled =
                currentPreparation?.pauseReason === 'access' ||
                currentPreparation?.pauseReason === 'stale';
            if (
                !accessValid ||
                lifecycleCancelled ||
                ['stopping', 'paused'].includes(currentPreparation!.state)
            ) {
                if (!accessValid || lifecycleCancelled)
                    await this.settleParent(tx, row, context.now);
                await tx
                    .update(preparations)
                    .set({ state: 'paused', updatedAt: context.now })
                    .where(eq(preparations.id, row.id));
                return true;
            }
            for (const batch of partitions)
                await this.refreshManifest(tx, row, batch);
            const pending = partitions.find(
                (batch) =>
                    covered(batch).size < batch.entries.length &&
                    !(row.mode === 'review-only' && batch.reviewed),
            );
            if (!pending) {
                await this.settleParent(tx, row, context.now);
                await tx
                    .update(preparations)
                    .set({
                        state: 'completed',
                        pauseReason: null,
                        updatedAt: context.now,
                    })
                    .where(eq(preparations.id, row.id));
                return true;
            }
            if (
                row.mode !== 'review-only' &&
                !(await this.parentAvailable(tx, row, context.now))
            ) {
                await this.settleParent(tx, row, context.now);
                await pause('budget');
                return true;
            }
            if (row.mode !== 'new-only') {
                const ready = covered(pending);
                let cursor = pending.scanCursor
                    ? {
                          createdAt: new Date(pending.scanCursor.createdAt),
                          id: pending.scanCursor.id,
                      }
                    : undefined;
                let exhausted: boolean;
                {
                    const saved = await tx
                        .select()
                        .from(exercises)
                        .where(
                            and(
                                eq(exercises.dictionaryId, row.dictionaryId),
                                eq(exercises.direction, row.direction),
                                or(
                                    eq(exercises.creatorId, row.learnerId),
                                    eq(exercises.shared, true),
                                ),
                                sql`exists(select 1 from ${exerciseEntries} linked where linked.exercise_id=${exercises.id})`,
                                sql`not exists(select 1 from ${exerciseEntries} linked where linked.exercise_id=${exercises.id} and not (${sql.join(
                                    pending.entries.map(
                                        (entry) =>
                                            sql`(linked.entry_id=${entry.entryId}::uuid and linked.learning_version=${entry.learningVersion})`,
                                    ),
                                    sql` or `,
                                )}))`,
                                sql`not exists(select 1 from ${personal} pv where pv.exercise_id=${exercises.id} and pv.learner_id=${row.learnerId}::uuid and pv.archived_at is not null)`,
                                sql`not exists(select 1 from ${global} gv where gv.exercise_id=${exercises.id} and gv.archived_at is not null)`,
                                cursor
                                    ? sql`(${exercises.createdAt},${exercises.id})>(${cursor.createdAt.toISOString()}::timestamptz,${cursor.id}::uuid)`
                                    : sql`true`,
                            ),
                        )
                        .orderBy(asc(exercises.createdAt), asc(exercises.id))
                        .limit(100);
                    exhausted = saved.length < 100;
                    for (const exercise of saved) {
                        if (
                            !SentenceExerciseSchema.safeParse(
                                exercise.publicContent,
                            ).success ||
                            exercise.publicContent.sourceLanguage !==
                                row.sourceLanguage ||
                            exercise.publicContent.targetLanguage !==
                                row.targetLanguage ||
                            !sentenceLanguageMatches(
                                exercise.publicContent.sourceText,
                                row.sourceLanguage,
                                row.targetLanguage,
                            ) ||
                            !sentenceLanguageMatches(
                                exercise.referenceTranslation,
                                row.targetLanguage,
                                row.sourceLanguage,
                            ) ||
                            !(await this.visible(
                                tx,
                                row.learnerId,
                                exercise.id,
                            ))
                        )
                            continue;
                        const linked = await sentenceExerciseEntries(
                            tx,
                            exercise.id,
                        );
                        if (
                            !linked.length ||
                            !linked.every((entry) =>
                                pending.entries.some(
                                    (candidate) =>
                                        candidate.entryId === entry.entryId &&
                                        candidate.learningVersion ===
                                            entry.learningVersion,
                                ),
                            ) ||
                            !linked.some(
                                (entry) => !ready.has(entry.entryId),
                            ) ||
                            !(await isSentenceCurrent(tx, exercise.id))
                        )
                            continue;
                        pending.manifest.push({
                            exerciseId: exercise.id,
                            entryIds: linked.map((entry) => entry.entryId),
                            origin: 'saved',
                        });
                        linked.forEach((entry) => ready.add(entry.entryId));
                        if (ready.size === pending.entries.length) break;
                    }
                    if (saved.length)
                        cursor = {
                            createdAt: saved.at(-1)!.createdAt,
                            id: saved.at(-1)!.id,
                        };
                }
                await tx
                    .update(batches)
                    .set({
                        manifest: pending.manifest,
                        scanCursor: cursor
                            ? {
                                  createdAt: cursor.createdAt.toISOString(),
                                  id: cursor.id,
                              }
                            : null,
                    })
                    .where(eq(batches.id, pending.id));
                if (ready.size === pending.entries.length) {
                    await tx
                        .update(preparations)
                        .set({ state: 'running', updatedAt: context.now })
                        .where(eq(preparations.id, row.id));
                    return true;
                }
                if (!exhausted) {
                    await tx
                        .update(preparations)
                        .set({ state: 'running', updatedAt: context.now })
                        .where(eq(preparations.id, row.id));
                    return true;
                }
                if (row.mode === 'review-only') {
                    await tx
                        .update(batches)
                        .set({ reviewed: true })
                        .where(eq(batches.id, pending.id));
                    await tx
                        .update(preparations)
                        .set({ state: 'running', updatedAt: context.now })
                        .where(eq(preparations.id, row.id));
                    return true;
                }
            }
            try {
                // Savepoint rolls back partial reservation/admission writes before persisting pause.
                await tx.transaction(async (childTx) => {
                    const { jobId } = await this.policy.admitGeneration(
                        childTx,
                        accessFor(row),
                        {
                            preparationId: row.id,
                            batchId: pending.id,
                            coordinatorFence: row.coordinatorFence,
                        },
                        context,
                    );
                    if (!jobId) throw new SentenceCreditsExhaustedError();
                });
            } catch (error) {
                if (error instanceof SentenceCreditsExhaustedError) {
                    await this.settleParent(tx, row, context.now);
                    await pause('budget');
                } else if (error instanceof SentenceCapacityUnavailableError)
                    await pause('capacity');
                else if (error instanceof SentenceModelUnavailableError)
                    await pause('model');
                else throw error;
            }
            context.signal.throwIfAborted();
            return true;
        });
    }
}
