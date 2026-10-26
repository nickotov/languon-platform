import { TextAiSelectionUnavailableError } from '../../../../text-ai/application/text-ai-admission-participant';
import { dictionaryActionInputOverhead } from './legacy-generation-input-limit';
import {
    usesLegacyAction,
    admitLegacyAttempt,
    admittedLegacyExecution,
} from '../../../../ai-credits/infrastructure/persistence/drizzle/legacy-action-accounting';
import { modelPricingTransaction } from '../../../../ai-credits/infrastructure/price-aware-transaction';
import {
    textAiProviderBudgetAllows as dictionaryGenerationProviderBudgetAllows,
    lockTextAiCapacity,
    readTextAiCapacity,
} from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { dictionaryAiConfigurationRevisionsTable } from '../../../../text-ai/infrastructure/persistence/drizzle/configuration-schema';
import {
    and,
    asc,
    eq,
    inArray,
    isNotNull,
    isNull,
    lt,
    lte,
    or,
    sql,
} from 'drizzle-orm';
import { AiCreditInsufficientBalanceError } from '../../../../ai-credits/domain/ai-credit';
import type {
    ClaimedDictionaryGenerationJob,
    DictionaryGenerationStore,
} from '../../../application/ports/dictionary-generation-store';
import { parseDictionaryGenerationInput } from '../../../domain/generation';
import {
    dictionaryGenerationJobsTable,
    dictionaryGenerationProposalsTable,
    dictionaryGenerationProviderCircuitTable,
} from './schema';
import type { GenerationStoreContext } from './generation-context';
import { abort } from './generation-context';
import { recoverGenerationJobs } from './generation-worker-recovery';
import {
    providerCircuitAvailableCondition,
    jobProviderCircuitKey,
} from './generation-provider-circuit';
import {
    persistedProviderBudget,
    providerBudgetUsage,
} from './generation-admission';
import {
    reserveAiCreditAttempt,
    settleCurrentAiCreditAttempt,
} from './generation-accounting';
import { scheduleDocumentCleanup } from './generation-cancellation';

export async function claim(
    context: GenerationStoreContext,
    input: Parameters<DictionaryGenerationStore['claim']>[0],
): Promise<ClaimedDictionaryGenerationJob | null> {
    return modelPricingTransaction(context.database, async (tx) => {
        abort(input.context);
        if (input.creditSettlementRevision === 1)
            await tx.execute(
                sql`select set_config('languon.ai_credit_settlement_revision', '1', true)`,
            );
        if (input.textAiSelectionRevision === 1) {
            await tx.execute(
                sql`select set_config('languon.text_ai_selection_revision', '1', true)`,
            );
        }

        if (input.managedRoutingRevision === 1) {
            await tx.execute(
                sql`select set_config('languon.dictionary_ai_routing_revision', '1', true)`,
            );
        }

        await lockTextAiCapacity(tx);
        await recoverGenerationJobs(context, tx, input);

        const runningCapacity = await readTextAiCapacity(tx, {
            actorId: '00000000-0000-0000-0000-000000000000',
            now: input.context.now,
            budget: context.providerBudget,
        });

        if (runningCapacity.globalRunning >= input.globalConcurrency)
            return null;
        const runningForOwner = sql<number>`(
                select count(*) from (
                    select owner_id as actor_id from dictionary_generation_jobs where execution_state='running'
                    union all
                    select learner_id as actor_id from sentence_ai_jobs where execution_state='running'
                ) running where running.actor_id = ${dictionaryGenerationJobsTable.ownerId}
            )`;
        const [candidate] = await tx
            .select()
            .from(dictionaryGenerationJobsTable)
            .where(
                and(
                    eq(dictionaryGenerationJobsTable.executionState, 'queued'),
                    lte(
                        dictionaryGenerationJobsTable.nextAttemptAt,
                        input.context.now,
                    ),
                    inArray(dictionaryGenerationJobsTable.format, [
                        ...input.supportedFormats,
                    ]),

                    lt(
                        dictionaryGenerationJobsTable.attemptCount,
                        dictionaryGenerationJobsTable.maxAttempts,
                    ),
                    sql`${dictionaryGenerationJobsTable.inputPayload} is not null`,
                    sql`not exists (
                            select 1 from ${dictionaryGenerationProposalsTable} staged
                            where staged.job_id = ${dictionaryGenerationJobsTable.id}
                              and staged.document_staged_at is not null
                              and staged.document_published_at is null
                        )`,
                    eq(
                        dictionaryGenerationJobsTable.providerReservationState,
                        'active',
                    ),
                    isNull(
                        dictionaryGenerationJobsTable.cancellationRequestedAt,
                    ),
                    input.textAiSelectionRevision === 1
                        ? undefined
                        : isNull(
                              dictionaryGenerationJobsTable.selectedExecutionVersion,
                          ),
                    input.creditSettlementRevision === 1
                        ? undefined
                        : eq(
                              dictionaryGenerationJobsTable.aiCreditAccounted,
                              false,
                          ),
                    or(
                        isNotNull(
                            dictionaryGenerationJobsTable.executionRevisionId,
                        ),
                        and(
                            sql`${dictionaryGenerationJobsTable.providerInputCostMicrosPerMillionTokens} >= ${context.providerBudget.inputCostMicrosPerMillionTokens}`,
                            sql`${dictionaryGenerationJobsTable.providerOutputCostMicrosPerMillionTokens} >= ${context.providerBudget.outputCostMicrosPerMillionTokens}`,
                            sql`${dictionaryGenerationJobsTable.providerMaxCostMicrosPerAttempt} >= ${context.providerBudget.maxCostMicrosPerAttempt}`,
                            sql`${dictionaryGenerationJobsTable.providerMaxInputTokensPerAttempt} <= ${context.providerBudget.maxInputTokensPerAttempt}`,
                            sql`${dictionaryGenerationJobsTable.providerMaxOutputTokensPerAttempt} <= ${context.providerBudget.maxOutputTokensPerAttempt}`,
                        ),
                    ),
                    providerCircuitAvailableCondition(input.context.now),
                    sql`${runningForOwner} < ${input.ownerConcurrency}`,
                ),
            )
            .orderBy(
                asc(runningForOwner),
                asc(dictionaryGenerationJobsTable.createdAt),
                asc(dictionaryGenerationJobsTable.id),
            )
            .limit(1)
            .for('update', { skipLocked: true });

        if (!candidate?.inputPayload) return null;
        const [candidateCircuit] = await tx
            .select()
            .from(dictionaryGenerationProviderCircuitTable)
            .where(
                eq(
                    dictionaryGenerationProviderCircuitTable.id,
                    await jobProviderCircuitKey(tx, candidate),
                ),
            )
            .limit(1)
            .for('update');

        if (
            candidateCircuit?.openUntil &&
            candidateCircuit.openUntil > input.context.now
        )
            return null;
        let candidateProviderBudget = persistedProviderBudget(candidate);
        const reservedAttempts =
            candidate.providerReservedAttempts ||
            Math.max(
                1,
                Math.round(
                    candidate.providerReservedCostMicros /
                        candidateProviderBudget.maxCostMicrosPerAttempt,
                ),
            );
        const needsAttemptReservation =
            reservedAttempts < candidate.attemptCount + 1;
        const budgetUsage = await providerBudgetUsage(
            tx,
            candidate.ownerId,
            input.context.now,
            candidateProviderBudget,
        );
        const effectiveBudgetUsage = candidate.aiCreditAccounted
            ? {
                  ...budgetUsage,
                  ownerSettledCostMicros: 0,
                  ownerSettledInputTokens: 0,
                  ownerSettledOutputTokens: 0,
              }
            : budgetUsage;

        if (
            !dictionaryGenerationProviderBudgetAllows(
                effectiveBudgetUsage,
                needsAttemptReservation,
                candidateProviderBudget,
            )
        )
            return null;
        let aiCreditReservation:
            { id: string; mode: 'limited' | 'unlimited' } | undefined;

        if (candidate.aiCreditAccounted && !candidate.aiCreditReservationId) {
            try {
                aiCreditReservation = await reserveAiCreditAttempt(
                    context,
                    tx,
                    candidate,
                    candidate.attemptCount + 1,
                    input.context.now,
                );
            } catch (error) {
                if (!(error instanceof AiCreditInsufficientBalanceError))
                    throw error;
                await tx
                    .update(dictionaryGenerationJobsTable)
                    .set({
                        completedAt: input.context.now,
                        executionState: 'failed',
                        failureCategory: 'ai_credits_exhausted',
                        heartbeatAt: null,
                        inputPayload: null,
                        leaseDeadline: null,
                        nextAttemptAt: input.context.now,
                        progressPercent: 100,
                        progressStage: 'terminal',
                        providerActualCostMicros:
                            candidate.providerReservedCostMicros,
                        providerActualInputTokens:
                            candidate.providerReservedInputTokens,
                        providerActualOutputTokens:
                            candidate.providerReservedOutputTokens,
                        providerReservationSettledAt: input.context.now,
                        providerReservationState: 'settled',
                        updatedAt: input.context.now,
                        workerId: null,
                    })
                    .where(eq(dictionaryGenerationJobsTable.id, candidate.id));

                if (candidate.kind === 'document-terms')
                    await scheduleDocumentCleanup(
                        tx,
                        candidate.id,
                        input.context.now,
                        'failed',
                    );

                return null;
            }
        }

        const parsed = parseDictionaryGenerationInput(candidate.inputPayload);
        const leaseDeadline = new Date(
            input.context.now.getTime() + input.leaseDurationMs,
        );
        const fencingToken = candidate.fencingToken + 1n;
        const [claimed] = await tx
            .update(dictionaryGenerationJobsTable)
            .set({
                aiCreditPolicyMode:
                    aiCreditReservation?.mode ?? candidate.aiCreditPolicyMode,
                aiCreditProviderDispatchedAt:
                    aiCreditReservation ||
                    usesLegacyAction(candidate.selectedExecutionSnapshot)
                        ? null
                        : candidate.aiCreditProviderDispatchedAt,
                aiCreditReservationId:
                    aiCreditReservation?.id ?? candidate.aiCreditReservationId,
                attemptCount: candidate.attemptCount + 1,
                executionState: 'running',
                fencingToken,
                heartbeatAt: input.context.now,
                leaseDeadline,
                progressPercent: 5,
                progressStage: 'generating',
                providerReservedAttempts:
                    reservedAttempts + (needsAttemptReservation ? 1 : 0),
                providerReservedCostMicros:
                    candidate.providerReservedCostMicros +
                    (needsAttemptReservation
                        ? candidateProviderBudget.maxCostMicrosPerAttempt
                        : 0),
                providerReservedInputTokens:
                    candidate.providerReservedInputTokens +
                    (needsAttemptReservation
                        ? candidateProviderBudget.maxInputTokensPerAttempt
                        : 0),
                providerReservedOutputTokens:
                    candidate.providerReservedOutputTokens +
                    (needsAttemptReservation
                        ? candidateProviderBudget.maxOutputTokensPerAttempt
                        : 0),
                updatedAt: input.context.now,
                workerId: input.workerId,
            })
            .where(
                and(
                    eq(dictionaryGenerationJobsTable.id, candidate.id),
                    eq(dictionaryGenerationJobsTable.executionState, 'queued'),
                    eq(
                        dictionaryGenerationJobsTable.fencingToken,
                        candidate.fencingToken,
                    ),
                    isNull(
                        dictionaryGenerationJobsTable.cancellationRequestedAt,
                    ),
                ),
            )
            .returning();

        if (!claimed) return null;
        if (usesLegacyAction(candidate.selectedExecutionSnapshot)) {
            let routeUnavailable = false;
            const admitted = await admitLegacyAttempt(tx, {
                id: candidate.id,
                ownerId: candidate.ownerId,
                workerId: input.workerId,
                fencingToken: String(fencingToken),
                attempt: candidate.attemptCount + 1,
                budget: candidateProviderBudget,
                inputPayload: candidate.inputPayload,
                inputOverheadTokens: dictionaryActionInputOverhead(
                    candidate.inputPayload,
                ),
                at: input.context.now,
            }).catch((error: unknown) => {
                if (error instanceof TextAiSelectionUnavailableError) {
                    routeUnavailable = true;

                    return null;
                }

                throw error;
            });

            if (!admitted) {
                await settleCurrentAiCreditAttempt(tx, candidate, {
                    at: input.context.now,
                });

                await tx
                    .update(dictionaryGenerationJobsTable)
                    .set({
                        completedAt: input.context.now,
                        executionState: 'failed',
                        failureCategory: routeUnavailable
                            ? 'provider_unavailable'
                            : 'ai_credits_exhausted',
                        heartbeatAt: null,
                        inputPayload: null,
                        leaseDeadline: null,
                        nextAttemptAt: input.context.now,
                        progressPercent: 100,
                        progressStage: 'terminal',
                        providerActualCostMicros:
                            candidate.providerReservedCostMicros,
                        providerActualInputTokens:
                            candidate.providerReservedInputTokens,
                        providerActualOutputTokens:
                            candidate.providerReservedOutputTokens,
                        providerReservationSettledAt: input.context.now,
                        providerReservationState: 'settled',
                        updatedAt: input.context.now,
                        workerId: null,
                    })
                    .where(eq(dictionaryGenerationJobsTable.id, candidate.id));

                if (candidate.kind === 'document-terms')
                    await scheduleDocumentCleanup(
                        tx,
                        candidate.id,
                        input.context.now,
                        'failed',
                    );

                return null;
            }

            candidateProviderBudget = admitted;
        }

        const [revision] = claimed.executionRevisionId
            ? await tx
                  .select({
                      snapshot:
                          dictionaryAiConfigurationRevisionsTable.catalogSnapshot,
                  })
                  .from(dictionaryAiConfigurationRevisionsTable)
                  .where(
                      eq(
                          dictionaryAiConfigurationRevisionsTable.id,
                          claimed.executionRevisionId,
                      ),
                  )
                  .limit(1)
            : [];

        if (claimed.executionRevisionId && !revision) return null;

        return {
            attempt: claimed.attemptCount,
            fencingToken,
            id: claimed.id,
            input: parsed,
            leaseDeadline,
            providerBudget: candidateProviderBudget,
            providerExecution: usesLegacyAction(
                claimed.selectedExecutionSnapshot,
            )
                ? {
                      ...(await admittedLegacyExecution(
                          tx,
                          claimed.selectedExecutionSnapshot,
                          claimed.id,
                          claimed.attemptCount,
                      )),
                      aggregateBudget: candidateProviderBudget,
                  }
                : (claimed.selectedExecutionSnapshot ??
                  revision?.snapshot ??
                  null),
            workerId: input.workerId,
        };
    });
}
