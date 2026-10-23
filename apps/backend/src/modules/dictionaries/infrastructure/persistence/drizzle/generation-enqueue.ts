import { withActionBilling } from '../../../../ai-credits/infrastructure/persistence/drizzle/action-billing';
import { modelPricingTransaction } from '../../../../ai-credits/infrastructure/price-aware-transaction';
import { lockTextAiCapacity } from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { and, eq } from 'drizzle-orm';
import {
    DictionaryCardNotFoundError,
    DictionaryIdempotencyConflictError,
    DictionaryNotFoundError,
    DictionaryVersionConflictError,
} from '../../../application/dictionary-errors';
import type { DictionaryGenerationStore } from '../../../application/ports/dictionary-generation-store';
import {
    dictionaryGenerationFormat,
    parseDictionaryGenerationInput,
} from '../../../domain/generation';
import { resolveTranslationContext } from '../../../domain/translation-context';
import { resolveCardSettings } from '../../../domain/settings';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    dictionariesTable,
    dictionaryCardsTable,
    dictionaryGenerationJobsTable,
    dictionarySettingsTable,
} from './schema';
import type { GenerationStoreContext } from './generation-context';
import { abort } from './generation-context';
import { readView } from './generation-job-access';
import { assertGenerationAdmission } from './generation-admission';
import {
    domainSettings,
    domainOverrides,
    wireOverrides,
    values,
} from './generation-card-snapshots';
import {
    aiCreditJobValues,
    reserveInitialAiCreditAttempt,
} from './generation-accounting';
import { mapJob } from './generation-job-mapping';

export async function enqueue(
    context: GenerationStoreContext,
    input: Parameters<DictionaryGenerationStore['enqueue']>[0],
) {
    return modelPricingTransaction(context.database, async (tx) => {
        abort(input.context);
        await lockTextAiCapacity(tx);
        abort(input.context);
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
                    eq(dictionaryGenerationJobsTable.kind, 'single-card'),
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

        const [current] = await tx
            .select({
                card: dictionaryCardsTable,
                dictionary: dictionariesTable,
                settings: dictionarySettingsTable,
            })
            .from(dictionariesTable)
            .innerJoin(
                dictionarySettingsTable,
                eq(dictionarySettingsTable.dictionaryId, dictionariesTable.id),
            )
            .innerJoin(
                dictionaryCardsTable,
                and(
                    eq(dictionaryCardsTable.id, input.cardId),
                    eq(dictionaryCardsTable.dictionaryId, dictionariesTable.id),
                ),
            )
            .where(
                and(
                    eq(dictionariesTable.id, input.dictionaryId),
                    eq(dictionariesTable.ownerId, input.ownerId),
                ),
            )
            .for('update');

        abort(input.context);
        if (!current) throw new DictionaryNotFoundError();
        if (current.card.lifecycle !== 'active')
            throw new DictionaryCardNotFoundError();
        if (
            current.dictionary.lifecycle !== 'active' ||
            current.dictionary.version !== input.expectedDictionaryVersion ||
            current.settings.version !== input.expectedSettingsVersion ||
            current.card.version !== input.expectedCardVersion
        )
            throw new DictionaryVersionConflictError();

        const providerExecution = await assertGenerationAdmission(
            context,
            tx,
            input.ownerId,
            dictionaryGenerationFormat,
            input.context.now,
        );

        abort(input.context);

        const effective = resolveCardSettings({
            dictionary: domainSettings(current.settings),
            overrides: domainOverrides(wireOverrides(current.card)),
        });
        const payload = parseDictionaryGenerationInput({
            context: {
                cardId: current.card.id,
                dictionaryId: current.dictionary.id,
                expectedCardVersion: current.card.version,
                expectedDictionaryVersion: current.dictionary.version,
                expectedSettingsVersion: current.settings.version,
                sourceLanguage: current.dictionary.sourceLanguageTag,
                targetLanguage: current.dictionary.targetLanguageTag,
            },
            format: dictionaryGenerationFormat,
            instruction: input.instruction,
            translationContext: resolveTranslationContext({
                card: current.card.translationContext,
                dictionary: current.dictionary.translationContext,
            }),
            original: {
                authorship: current.card.authorship,
                effectiveSettings: {
                    definitionEnabled: effective.definitionEnabled,
                    definitionLanguage: effective.definitionLanguageRole,
                    exampleEnabled: effective.exampleEnabled,
                    exampleLanguage: effective.exampleLanguageRole,
                    exampleTranslationEnabled:
                        effective.exampleTranslationEnabled,
                    exampleTranslationLanguage:
                        effective.exampleTranslationLanguageRole,
                    transcriptionCustomLabel: effective.customNotationLabel,
                    transcriptionEnabled: effective.transcriptionEnabled,
                    transcriptionNotation: effective.transcriptionNotation,
                },
                overrides: wireOverrides(current.card),
                values: values(current.card),
            },
        });
        const [job] = await tx
            .insert(dictionaryGenerationJobsTable)
            .values({
                ...aiCreditJobValues(context, providerExecution),
                cardId: input.cardId,
                createdAt: input.context.now,
                dictionaryId: input.dictionaryId,
                executionRevisionId: providerExecution.revisionId,
                selectedExecutionVersion: providerExecution.selectionVersion,
                selectedExecutionSnapshot: providerExecution.selectionVersion
                    ? providerExecution.snapshot
                    : null,
                expectedCardVersion: input.expectedCardVersion,
                expectedDictionaryVersion: input.expectedDictionaryVersion,
                expectedSettingsVersion: input.expectedSettingsVersion,
                format: dictionaryGenerationFormat,
                id: context.ids.generate(),
                idempotencyKey: input.idempotencyKey,
                inputPayload: payload,
                kind: 'single-card',
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
