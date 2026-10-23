import { withActionBilling } from '../../../../ai-credits/infrastructure/persistence/drizzle/action-billing';
import { modelPricingTransaction } from '../../../../ai-credits/infrastructure/price-aware-transaction';
import { lockTextAiCapacity } from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { and, eq } from 'drizzle-orm';
import {
    DictionaryGenerationCandidateConflictError,
    DictionaryGenerationNotReviewableError,
    DictionaryGenerationProposalExpiredError,
    DictionaryIdempotencyConflictError,
    DictionaryNotFoundError,
    DictionaryVersionConflictError,
} from '../../../application/dictionary-errors';
import type { DictionaryGenerationStore } from '../../../application/ports/dictionary-generation-store';
import { parseDictionaryImportPairsGenerationProposal } from '../../../domain/batch-generation';
import {
    dictionaryImportPairsGenerationFormat,
    parseDictionaryGenerationInput,
} from '../../../domain/generation';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    dictionariesTable,
    dictionaryGenerationJobsTable,
    dictionarySettingsTable,
} from './schema';
import type { GenerationStoreContext } from './generation-context';
import { abort } from './generation-context';
import { readView, lockOwnedJob, lockProposal } from './generation-job-access';
import { assertGenerationAdmission } from './generation-admission';
import { wireEffectiveSettings } from './generation-card-snapshots';
import {
    aiCreditJobValues,
    reserveInitialAiCreditAttempt,
} from './generation-accounting';
import { mapJob } from './generation-job-mapping';

export async function enqueueImportPairsRetry(
    context: GenerationStoreContext,
    input: Parameters<DictionaryGenerationStore['enqueueImportPairsRetry']>[0],
) {
    return modelPricingTransaction(context.database, async (tx) => {
        abort(input.context);
        await lockTextAiCapacity(tx);
        const [owner] = await tx
            .select({ id: usersTable.id })
            .from(usersTable)
            .where(eq(usersTable.id, input.ownerId))
            .limit(1)
            .for('update');

        if (!owner) throw new DictionaryNotFoundError();
        const [replay] = await tx
            .select()
            .from(dictionaryGenerationJobsTable)
            .where(
                and(
                    eq(dictionaryGenerationJobsTable.ownerId, input.ownerId),
                    eq(dictionaryGenerationJobsTable.kind, 'import-pairs'),
                    eq(
                        dictionaryGenerationJobsTable.idempotencyKey,
                        input.idempotencyKey,
                    ),
                ),
            )
            .limit(1)
            .for('share');

        if (replay) {
            if (replay.requestFingerprint !== input.fingerprint)
                throw new DictionaryIdempotencyConflictError();

            return readView(tx, replay, input.context.now);
        }

        const predecessor = await lockOwnedJob(
            tx,
            input.ownerId,
            input.predecessorJobId,
        );

        if (predecessor.kind !== 'import-pairs' || !predecessor.inputPayload)
            throw new DictionaryGenerationNotReviewableError();
        const predecessorInput = parseDictionaryGenerationInput(
            predecessor.inputPayload,
        );
        const predecessorProposal = await lockProposal(tx, predecessor.id);
        if (
            predecessorInput.format !== dictionaryImportPairsGenerationFormat ||
            !predecessorProposal?.payload ||
            predecessorProposal.reviewState !== 'reviewable'
        )
            throw new DictionaryGenerationNotReviewableError();
        if (predecessorProposal.expiresAt <= input.context.now)
            throw new DictionaryGenerationProposalExpiredError();
        const retryableFailures = new Set(
            parseDictionaryImportPairsGenerationProposal(
                predecessorProposal.payload,
            )
                .failures.filter((failure) => failure.retryable)
                .map((failure) => failure.rowIndex),
        );
        const persistedRows = new Map(
            predecessorInput.rows.map((row) => [row.rowIndex, row] as const),
        );
        const rowIndexes = [...input.rowIndexes].sort(
            (left, right) => left - right,
        );
        const rows = rowIndexes.map((rowIndex) => {
            const row = persistedRows.get(rowIndex);
            if (!row || !retryableFailures.has(rowIndex))
                throw new DictionaryGenerationCandidateConflictError();

            return row;
        });

        const [current] = await tx
            .select({
                dictionary: dictionariesTable,
                settings: dictionarySettingsTable,
            })
            .from(dictionariesTable)
            .innerJoin(
                dictionarySettingsTable,
                eq(dictionarySettingsTable.dictionaryId, dictionariesTable.id),
            )
            .where(
                and(
                    eq(dictionariesTable.id, predecessor.dictionaryId),
                    eq(dictionariesTable.ownerId, input.ownerId),
                ),
            )
            .limit(1)
            .for('update', { of: dictionariesTable });

        if (!current) throw new DictionaryNotFoundError();
        await tx
            .select({ dictionaryId: dictionarySettingsTable.dictionaryId })
            .from(dictionarySettingsTable)
            .where(
                eq(dictionarySettingsTable.dictionaryId, current.dictionary.id),
            )
            .limit(1)
            .for('update');

        if (
            current.dictionary.lifecycle !== 'active' ||
            current.dictionary.version !== input.expectedDictionaryVersion ||
            current.settings.version !== input.expectedSettingsVersion ||
            current.dictionary.sourceLanguageTag !==
                predecessor.sourceLanguageTag ||
            current.dictionary.targetLanguageTag !==
                predecessor.targetLanguageTag
        )
            throw new DictionaryVersionConflictError();
        const providerExecution = await assertGenerationAdmission(
            context,
            tx,
            input.ownerId,
            dictionaryImportPairsGenerationFormat,
            input.context.now,
        );
        const payload = parseDictionaryGenerationInput({
            context: {
                dictionaryId: current.dictionary.id,
                expectedDictionaryVersion: current.dictionary.version,
                expectedSettingsVersion: current.settings.version,
                sourceLanguage: current.dictionary.sourceLanguageTag,
                targetLanguage: current.dictionary.targetLanguageTag,
            },
            effectiveSettings: wireEffectiveSettings(current.settings),
            format: dictionaryImportPairsGenerationFormat,
            importFingerprint: predecessorInput.importFingerprint,
            instruction: predecessorInput.instruction,
            predecessor: {
                jobId: predecessor.id,
                rowIndexes,
            },
            rows,
            translationContext: current.dictionary.translationContext,
        });
        const [job] = await tx
            .insert(dictionaryGenerationJobsTable)
            .values({
                ...aiCreditJobValues(context, providerExecution),
                cardId: null,
                createdAt: input.context.now,
                dictionaryId: current.dictionary.id,
                executionRevisionId: providerExecution.revisionId,
                selectedExecutionVersion: providerExecution.selectionVersion,
                selectedExecutionSnapshot: providerExecution.selectionVersion
                    ? providerExecution.snapshot
                    : null,
                expectedCardVersion: null,
                expectedDictionaryVersion: current.dictionary.version,
                expectedSettingsVersion: current.settings.version,
                format: dictionaryImportPairsGenerationFormat,
                id: context.ids.generate(),
                idempotencyKey: input.idempotencyKey,
                inputPayload: payload,
                kind: 'import-pairs',
                nextAttemptAt: input.context.now,
                ownerId: input.ownerId,
                providerReservationState: 'active',
                providerInputCostMicrosPerMillionTokens:
                    providerExecution.budget.inputCostMicrosPerMillionTokens,
                providerMaxCostMicrosPerAttempt:
                    providerExecution.budget.maxCostMicrosPerAttempt,
                providerMaxInputTokensPerAttempt:
                    providerExecution.budget.maxInputTokensPerAttempt,
                providerMaxOutputTokensPerAttempt:
                    providerExecution.budget.maxOutputTokensPerAttempt,
                providerOutputCostMicrosPerMillionTokens:
                    providerExecution.budget.outputCostMicrosPerMillionTokens,
                providerReservedAttempts: 1,
                providerReservedCostMicros:
                    providerExecution.budget.maxCostMicrosPerAttempt,
                providerReservedInputTokens:
                    providerExecution.budget.maxInputTokensPerAttempt,
                providerReservedOutputTokens:
                    providerExecution.budget.maxOutputTokensPerAttempt,
                requestFingerprint: input.fingerprint,
                sourceLanguageTag: current.dictionary.sourceLanguageTag,
                targetLanguageTag: current.dictionary.targetLanguageTag,
                updatedAt: input.context.now,
            })
            .returning();

        if (!job) throw new DictionaryVersionConflictError();
        await reserveInitialAiCreditAttempt(
            context,
            tx,
            job,
            input.context.now,
        );

        return withActionBilling(tx, mapJob(job, null), job.id, job.ownerId);
    });
}
