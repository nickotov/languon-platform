import {
    inputHasFormat,
    isSingleCardGenerationInput,
} from './generation-input';
import { modelPricingTransaction } from '../../../../ai-credits/infrastructure/price-aware-transaction';
import { dictionaryDocumentGenerationFormats } from '../../../domain/document-ingestion';
import {
    DictionaryCardAuthoringProposalPayloadSchema,
    DictionaryCardAuthoringProviderDeltaSchema,
    DictionaryCardAuthoringSuggestionLimitError,
    dictionaryCardAuthoringGenerationFormats,
    dictionaryCardAuthoringSuggestionLimitPerField,
    dictionaryCardAuthoringGenerationFormat,
    mergeDictionaryCardAuthoringProposal,
    resolveDictionaryCardAuthoringFields,
    usesModernCardAuthoringSemantics,
    type DictionaryCardAuthoringProposalPayload,
} from '../../../domain/card-authoring';
import { asc, eq, sql } from 'drizzle-orm';
import { DictionaryGenerationCompletionConflictError } from '../../../application/dictionary-errors';
import type { DictionaryGenerationStore } from '../../../application/ports/dictionary-generation-store';
import { dictionaryGenerationProviderUsageCostMicros } from '../../../application/ports/dictionary-generation-provider-policy';
import {
    createDictionaryBatchDuplicateWarnings,
    parseDictionaryImportPairsGenerationProposal,
    parseDictionaryBatchGenerationProposal,
} from '../../../domain/batch-generation';
import {
    dictionarySingleCardGenerationFormats,
    dictionaryImportPairsGenerationFormats,
    dictionaryPastedTermsGenerationFormats,
    parseDictionaryGenerationInput,
    parseDictionaryGenerationProposal,
} from '../../../domain/generation';
import { assertCardSettingsOverrideTransition } from '../../../domain/settings';
import {
    dictionaryCardsTable,
    dictionaryGenerationJobsTable,
    dictionaryGenerationProposalsTable,
    dictionarySettingsTable,
} from './schema';
import type { GenerationStoreContext } from './generation-context';
import { abort } from './generation-context';
import { workerCas, lockOwnedJob, lockProposal } from './generation-job-access';
import { persistedProviderBudget } from './generation-admission';
import { terminalizeCancelled } from './generation-cancellation';
import { domainSettings, domainOverrides } from './generation-card-snapshots';
import { settleCurrentAiCreditAttempt } from './generation-accounting';
import { recordProviderSuccess } from './generation-provider-circuit';

export async function complete(
    context: GenerationStoreContext,
    input: Parameters<DictionaryGenerationStore['complete']>[0],
) {
    return modelPricingTransaction(context.database, async (tx) => {
        await tx.execute(
            sql`select set_config('languon.ai_credit_settlement_revision', '1', true)`,
        );

        abort(input.context);
        const [job] = await tx
            .select()
            .from(dictionaryGenerationJobsTable)
            .where(workerCas(input))
            .for('update');

        if (!job) return false;
        const jobProviderBudget = persistedProviderBudget(job);
        if (job.cancellationRequestedAt) {
            await terminalizeCancelled(tx, job, input.context.now);

            return true;
        }

        const jobInput = parseDictionaryGenerationInput(job.inputPayload);
        const authoringInput = inputHasFormat(
            jobInput,
            dictionaryCardAuthoringGenerationFormats,
        )
            ? jobInput
            : null;
        const pastedTermsInput = inputHasFormat(
            jobInput,
            dictionaryPastedTermsGenerationFormats,
        )
            ? jobInput
            : null;
        const importPairsInput = inputHasFormat(
            jobInput,
            dictionaryImportPairsGenerationFormats,
        )
            ? jobInput
            : null;
        const isAuthoring = authoringInput !== null;
        if (inputHasFormat(jobInput, dictionaryDocumentGenerationFormats))
            throw new Error(
                'Document completion requires staged cleanup publication',
            );
        let authoringPredecessor:
            DictionaryCardAuthoringProposalPayload | undefined;

        if (authoringInput?.predecessor) {
            const predecessorJob = await lockOwnedJob(
                tx,
                job.ownerId,
                authoringInput.predecessor.jobId,
            );

            if (
                predecessorJob.kind !== 'card-authoring' ||
                predecessorJob.dictionaryId !== job.dictionaryId ||
                predecessorJob.expectedDictionaryVersion !==
                    job.expectedDictionaryVersion ||
                predecessorJob.expectedSettingsVersion !==
                    job.expectedSettingsVersion ||
                predecessorJob.sourceLanguageTag !== job.sourceLanguageTag ||
                predecessorJob.targetLanguageTag !== job.targetLanguageTag
            )
                throw new DictionaryGenerationCompletionConflictError(
                    'predecessor_changed',
                );
            const predecessorProposal = await lockProposal(
                tx,
                predecessorJob.id,
            );

            if (
                !predecessorProposal ||
                predecessorProposal.reviewState !== 'reviewable' ||
                !predecessorProposal.payload ||
                predecessorProposal.expiresAt <= input.context.now
            )
                throw new DictionaryGenerationCompletionConflictError(
                    'predecessor_changed',
                );
            authoringPredecessor =
                DictionaryCardAuthoringProposalPayloadSchema.parse(
                    predecessorProposal.payload,
                );

            const discarded = new Set(
                authoringInput.predecessor.discardedSuggestionIds,
            );

            for (const field of resolveDictionaryCardAuthoringFields(
                authoringInput.effectiveSettings,
                authoringInput.scope,
                usesModernCardAuthoringSemantics(authoringInput.format),
            )) {
                const remaining = [
                    ...authoringPredecessor.suggestions,
                    ...(authoringPredecessor.sourceSuggestions ?? []),
                ].filter(
                    (suggestion) =>
                        suggestion.field === field &&
                        !discarded.has(suggestion.id),
                ).length;

                if (remaining >= dictionaryCardAuthoringSuggestionLimitPerField)
                    throw new DictionaryGenerationCompletionConflictError(
                        'suggestion_capacity_reached',
                    );
            }
        }

        const mergeAuthoringProposal = () => {
            try {
                return mergeDictionaryCardAuthoringProposal({
                    delta: DictionaryCardAuthoringProviderDeltaSchema.parse(
                        input.proposal,
                    ),
                    discardedSuggestionIds: authoringInput
                        ? (authoringInput.predecessor?.discardedSuggestionIds ??
                          [])
                        : [],
                    nextId: () => context.ids.generate(),
                    ...(authoringPredecessor
                        ? { predecessor: authoringPredecessor }
                        : {}),
                    requestedFields: isAuthoring
                        ? resolveDictionaryCardAuthoringFields(
                              authoringInput!.effectiveSettings,
                              authoringInput!.scope,
                              usesModernCardAuthoringSemantics(
                                  authoringInput!.format,
                              ),
                          )
                        : [],
                    source: authoringInput?.source ?? '',
                    ...(authoringInput
                        ? { format: authoringInput.format }
                        : {}),
                    ...(authoringInput?.format ===
                    dictionaryCardAuthoringGenerationFormat
                        ? {
                              translationContext:
                                  authoringInput.translationContext,
                          }
                        : {}),
                });
            } catch (error) {
                if (
                    error instanceof DictionaryCardAuthoringSuggestionLimitError
                )
                    throw new DictionaryGenerationCompletionConflictError(
                        'suggestion_capacity_reached',
                    );

                throw error;
            }
        };
        let proposal = isAuthoring
            ? mergeAuthoringProposal()
            : pastedTermsInput
              ? parseDictionaryBatchGenerationProposal(input.proposal)
              : importPairsInput
                ? parseDictionaryImportPairsGenerationProposal(input.proposal)
                : parseDictionaryGenerationProposal(input.proposal);

        if (pastedTermsInput) {
            const batchProposal =
                parseDictionaryBatchGenerationProposal(proposal);
            const persistedRows = new Map(
                pastedTermsInput.rows.map((row) => [row.rowIndex, row.input]),
            );
            const resolvedRows = [
                ...batchProposal.candidates,
                ...batchProposal.failures,
            ];

            if (
                resolvedRows.length !== pastedTermsInput.rows.length ||
                resolvedRows.some(
                    (row) => persistedRows.get(row.rowIndex) !== row.input,
                )
            )
                throw new Error(
                    'Batch proposal rows do not match persisted input',
                );
            const existingSources = await tx
                .select({
                    cardId: dictionaryCardsTable.id,
                    source: dictionaryCardsTable.source,
                })
                .from(dictionaryCardsTable)
                .where(eq(dictionaryCardsTable.dictionaryId, job.dictionaryId))
                .orderBy(
                    asc(dictionaryCardsTable.sortKey),
                    asc(dictionaryCardsTable.id),
                );

            proposal = parseDictionaryBatchGenerationProposal({
                ...batchProposal,
                warnings: createDictionaryBatchDuplicateWarnings(
                    batchProposal.candidates.map((candidate) => ({
                        input: candidate.candidate.values.source,
                        rowIndex: candidate.rowIndex,
                    })),
                    existingSources,
                ),
            });
        }

        if (importPairsInput) {
            const importProposal =
                parseDictionaryImportPairsGenerationProposal(proposal);
            const persistedRows = new Map(
                importPairsInput.rows.map(
                    (row) => [row.rowIndex, row] as const,
                ),
            );
            const resolvedIndexes = [
                ...importProposal.candidates.map((row) => row.rowIndex),
                ...importProposal.failures.map((row) => row.rowIndex),
            ];

            if (
                resolvedIndexes.length !== importPairsInput.rows.length ||
                resolvedIndexes.some(
                    (rowIndex) => !persistedRows.has(rowIndex),
                ) ||
                importProposal.candidates.some((candidate) => {
                    const persisted = persistedRows.get(candidate.rowIndex);

                    return (
                        persisted?.source !== candidate.source ||
                        persisted.translation !== candidate.translation
                    );
                }) ||
                importProposal.failures.some((failure) => {
                    const persisted = persistedRows.get(failure.rowIndex);

                    return (
                        persisted?.source !== failure.source ||
                        persisted.translation !== failure.translation ||
                        persisted.source !== failure.input
                    );
                })
            )
                throw new Error(
                    'Import-pairs proposal rows do not match persisted input',
                );
            const existingSources = await tx
                .select({
                    cardId: dictionaryCardsTable.id,
                    source: dictionaryCardsTable.source,
                })
                .from(dictionaryCardsTable)
                .where(eq(dictionaryCardsTable.dictionaryId, job.dictionaryId))
                .orderBy(
                    asc(dictionaryCardsTable.sortKey),
                    asc(dictionaryCardsTable.id),
                );

            proposal = parseDictionaryImportPairsGenerationProposal({
                ...importProposal,
                warnings: createDictionaryBatchDuplicateWarnings(
                    importProposal.candidates.map((candidate) => ({
                        input: candidate.source,
                        rowIndex: candidate.rowIndex,
                    })),
                    existingSources,
                ),
            });
        }

        if (inputHasFormat(jobInput, dictionarySingleCardGenerationFormats)) {
            const [settings] = await tx
                .select()
                .from(dictionarySettingsTable)
                .where(
                    eq(dictionarySettingsTable.dictionaryId, job.dictionaryId),
                )
                .limit(1);

            if (!settings) return false;
            const singleProposal = parseDictionaryGenerationProposal(proposal);
            assertCardSettingsOverrideTransition({
                dictionary: domainSettings(settings),
                next: domainOverrides(singleProposal.candidate.overrides),
                previous: domainOverrides(jobInput.original.overrides),
            });
        }

        if (
            input.providerUsage &&
            (!Number.isSafeInteger(input.providerUsage.inputTokens) ||
                input.providerUsage.inputTokens < 0 ||
                !Number.isSafeInteger(input.providerUsage.outputTokens) ||
                input.providerUsage.outputTokens < 0 ||
                input.providerUsage.inputTokens >
                    jobProviderBudget.maxInputTokensPerAttempt ||
                input.providerUsage.outputTokens >
                    jobProviderBudget.maxOutputTokensPerAttempt)
        )
            throw new Error('Invalid provider usage');
        const priorAttemptCount = Math.max(0, job.attemptCount - 1);
        const finalAttemptCostMicros = input.providerUsage
            ? dictionaryGenerationProviderUsageCostMicros(
                  jobProviderBudget,
                  input.providerUsage,
              )
            : jobProviderBudget.maxCostMicrosPerAttempt;
        const actualCostMicros =
            priorAttemptCount * jobProviderBudget.maxCostMicrosPerAttempt +
            finalAttemptCostMicros;
        const actualInputTokens = input.providerUsage
            ? priorAttemptCount * jobProviderBudget.maxInputTokensPerAttempt +
              input.providerUsage.inputTokens
            : job.providerReservedInputTokens;
        const actualOutputTokens = input.providerUsage
            ? priorAttemptCount * jobProviderBudget.maxOutputTokensPerAttempt +
              input.providerUsage.outputTokens
            : job.providerReservedOutputTokens;

        if (
            actualCostMicros > job.providerReservedCostMicros ||
            actualInputTokens > job.providerReservedInputTokens ||
            actualOutputTokens > job.providerReservedOutputTokens
        )
            throw new Error('Provider usage exceeds reservation');
        await tx.insert(dictionaryGenerationProposalsTable).values({
            createdAt: input.context.now,
            expiresAt: input.reviewExpiresAt,
            jobId: job.id,
            payload: proposal,
            reviewState: 'reviewable',
            schemaVersion: job.proposalSchemaVersion,
            updatedAt: input.context.now,
        });

        await settleCurrentAiCreditAttempt(tx, job, {
            at: input.context.now,
            outcome: 'success',
            ...(input.providerUsage
                ? { providerUsage: input.providerUsage }
                : {}),
        });

        const [updated] = await tx
            .update(dictionaryGenerationJobsTable)
            .set({
                completedAt: input.context.now,
                executionState: 'completed',
                heartbeatAt: null,
                aiCreditReservationId: job.aiCreditAccounted
                    ? null
                    : job.aiCreditReservationId,
                inputPayload: isSingleCardGenerationInput(jobInput)
                    ? { ...jobInput, instruction: null }
                    : jobInput,
                leaseDeadline: null,
                progressPercent: 100,
                progressStage: 'review_ready',
                providerActualCostMicros: actualCostMicros,
                providerActualInputTokens: actualInputTokens,
                providerActualOutputTokens: actualOutputTokens,
                providerReservationSettledAt: input.context.now,
                providerReservationState: 'settled',
                updatedAt: input.context.now,
                workerId: null,
            })
            .where(workerCas(input))
            .returning({ id: dictionaryGenerationJobsTable.id });

        if (!updated) throw new Error('Generation completion fencing changed');
        await recordProviderSuccess(tx, job, input.context.now);

        return true;
    });
}
