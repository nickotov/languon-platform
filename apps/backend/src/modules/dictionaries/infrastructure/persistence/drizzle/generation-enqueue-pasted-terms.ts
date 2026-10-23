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
import {
    parseDictionaryBatchGenerationProposal,
    parseDictionaryBatchGenerationText,
} from '../../../domain/batch-generation';
import {
    dictionaryPastedTermsGenerationFormat,
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

export async function enqueuePastedTerms(
    context: GenerationStoreContext,
    input: Parameters<DictionaryGenerationStore['enqueuePastedTerms']>[0],
) {
    return modelPricingTransaction(context.database, async (tx) => {
        abort(input.context);
        await lockTextAiCapacity(tx);
        await tx
            .select({ id: usersTable.id })
            .from(usersTable)
            .where(eq(usersTable.id, input.ownerId))
            .for('update');

        abort(input.context);

        const [replay] = await tx
            .select()
            .from(dictionaryGenerationJobsTable)
            .where(
                and(
                    eq(dictionaryGenerationJobsTable.ownerId, input.ownerId),
                    eq(dictionaryGenerationJobsTable.kind, 'pasted-terms'),
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

        let rows;
        let sharedContext: string | null;
        let predecessor: {
            jobId: string;
            rowIndexes: number[];
        } | null = null;

        if (input.retry) {
            const priorJob = await lockOwnedJob(
                tx,
                input.ownerId,
                input.retry.jobId,
            );

            if (
                !['pasted-terms', 'document-terms'].includes(priorJob.kind) ||
                priorJob.dictionaryId !== input.dictionaryId
            )
                throw new DictionaryGenerationNotReviewableError();
            const priorProposal = await lockProposal(tx, priorJob.id);
            if (
                !priorProposal ||
                priorProposal.reviewState !== 'reviewable' ||
                !priorProposal.payload ||
                (priorJob.kind === 'document-terms' &&
                    (!priorProposal.documentStagedAt ||
                        !priorProposal.documentPublishedAt))
            )
                throw new DictionaryGenerationNotReviewableError();
            if (priorProposal.expiresAt <= input.context.now) {
                throw new DictionaryGenerationProposalExpiredError();
            }

            const priorInput = priorJob.inputPayload
                ? parseDictionaryGenerationInput(priorJob.inputPayload)
                : null;

            if (
                (priorJob.kind === 'pasted-terms' &&
                    priorInput?.format !==
                        dictionaryPastedTermsGenerationFormat) ||
                (priorJob.kind === 'document-terms' && priorInput !== null)
            )
                throw new DictionaryGenerationNotReviewableError();
            const failures = new Map(
                parseDictionaryBatchGenerationProposal(priorProposal.payload)
                    .failures.filter((failure) => failure.retryable)
                    .map((failure) => [failure.rowIndex, failure.input]),
            );
            const rowIndexes = [...input.retry.rowIndexes].sort(
                (left, right) => left - right,
            );
            const selectedInputs = rowIndexes.map((rowIndex) => {
                const value = failures.get(rowIndex);
                if (!value)
                    throw new DictionaryGenerationCandidateConflictError();

                return value;
            });

            rows = selectedInputs.map((value, rowIndex) => ({
                input: value,
                rowIndex,
            }));

            sharedContext =
                priorInput?.format === dictionaryPastedTermsGenerationFormat
                    ? priorInput.sharedContext
                    : null;

            predecessor = { jobId: priorJob.id, rowIndexes };
        } else {
            rows = parseDictionaryBatchGenerationText(input.text);
            sharedContext = input.sharedContext;
        }

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
                    eq(dictionariesTable.id, input.dictionaryId),
                    eq(dictionariesTable.ownerId, input.ownerId),
                ),
            )
            .for('update');

        if (!current) throw new DictionaryNotFoundError();
        if (
            current.dictionary.lifecycle !== 'active' ||
            current.dictionary.version !== input.expectedDictionaryVersion ||
            current.settings.version !== input.expectedSettingsVersion
        )
            throw new DictionaryVersionConflictError();
        const providerExecution = await assertGenerationAdmission(
            context,
            tx,
            input.ownerId,
            dictionaryPastedTermsGenerationFormat,
            input.context.now,
        );

        abort(input.context);

        const payload = parseDictionaryGenerationInput({
            context: {
                dictionaryId: current.dictionary.id,
                expectedDictionaryVersion: current.dictionary.version,
                expectedSettingsVersion: current.settings.version,
                sourceLanguage: current.dictionary.sourceLanguageTag,
                targetLanguage: current.dictionary.targetLanguageTag,
            },
            effectiveSettings: wireEffectiveSettings(current.settings),
            format: dictionaryPastedTermsGenerationFormat,
            ...(predecessor ? { predecessor } : {}),
            rows,
            sharedContext,
            translationContext: current.dictionary.translationContext,
        });
        const [job] = await tx
            .insert(dictionaryGenerationJobsTable)
            .values({
                ...aiCreditJobValues(context, providerExecution),
                cardId: null,
                createdAt: input.context.now,
                dictionaryId: input.dictionaryId,
                executionRevisionId: providerExecution.revisionId,
                selectedExecutionVersion: providerExecution.selectionVersion,
                selectedExecutionSnapshot: providerExecution.selectionVersion
                    ? providerExecution.snapshot
                    : null,
                expectedCardVersion: null,
                expectedDictionaryVersion: input.expectedDictionaryVersion,
                expectedSettingsVersion: input.expectedSettingsVersion,
                format: dictionaryPastedTermsGenerationFormat,
                id: context.ids.generate(),
                idempotencyKey: input.idempotencyKey,
                inputPayload: payload,
                kind: 'pasted-terms',
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

        await reserveInitialAiCreditAttempt(
            context,
            tx,
            job!,
            input.context.now,
        );

        return withActionBilling(tx, mapJob(job!, null), job!.id, job!.ownerId);
    });
}

export async function enqueueDocumentFailureRetry(
    context: GenerationStoreContext,
    input: Parameters<
        DictionaryGenerationStore['enqueueDocumentFailureRetry']
    >[0],
) {
    return enqueuePastedTerms(context, {
        context: input.context,
        dictionaryId: input.dictionaryId,
        expectedDictionaryVersion: input.expectedDictionaryVersion,
        expectedSettingsVersion: input.expectedSettingsVersion,
        fingerprint: input.fingerprint,
        idempotencyKey: input.idempotencyKey,
        ownerId: input.ownerId,
        retry: {
            jobId: input.predecessorJobId,
            rowIndexes: input.rowIndexes,
        },
    });
}
