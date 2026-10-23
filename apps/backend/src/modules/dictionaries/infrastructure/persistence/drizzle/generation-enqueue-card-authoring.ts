import { withActionBilling } from '../../../../ai-credits/infrastructure/persistence/drizzle/action-billing';
import { modelPricingTransaction } from '../../../../ai-credits/infrastructure/price-aware-transaction';
import { lockTextAiCapacity } from '../../../../../infrastructure/text-ai/text-ai-capacity';
import {
    DictionaryCardAuthoringGenerationInputPayloadSchema,
    dictionaryCardAuthoringExcludedValueLimitPerField,
    DictionaryCardAuthoringProposalPayloadSchema,
    dictionaryCardAuthoringSuggestionLimitPerField,
    dictionaryCardAuthoringGenerationFormat,
    dictionaryCardAuthoringGenerationFormatV1,
    resolveDictionaryCardAuthoringFields,
    usesModernCardAuthoringSemantics,
    type DictionaryCardAuthoringGenerationInputPayload,
} from '../../../domain/card-authoring';
import { and, eq } from 'drizzle-orm';
import {
    DictionaryCardNotFoundError,
    DictionaryGenerationCandidateConflictError,
    DictionaryGenerationNotReviewableError,
    DictionaryGenerationProposalExpiredError,
    DictionaryIdempotencyConflictError,
    DictionaryNotFoundError,
    DictionaryVersionConflictError,
} from '../../../application/dictionary-errors';
import type { DictionaryGenerationStore } from '../../../application/ports/dictionary-generation-store';
import { parseDictionaryGenerationInput } from '../../../domain/generation';
import { resolveTranslationContext } from '../../../domain/translation-context';
import { assertCardSettingsOverrideTransition } from '../../../domain/settings';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    dictionariesTable,
    dictionaryCardsTable,
    dictionaryGenerationJobsTable,
    dictionarySettingsTable,
} from './schema';
import type { GenerationStoreContext } from './generation-context';
import { abort } from './generation-context';
import { readView, lockOwnedJob, lockProposal } from './generation-job-access';
import {
    domainOverrides,
    domainSettings,
    wireEffectiveSettingsForOverrides,
} from './generation-card-snapshots';
import { assertGenerationAdmission } from './generation-admission';
import {
    aiCreditJobValues,
    reserveInitialAiCreditAttempt,
} from './generation-accounting';
import { mapJob } from './generation-job-mapping';

export async function enqueueCardAuthoring(
    context: GenerationStoreContext,
    input: Parameters<DictionaryGenerationStore['enqueueCardAuthoring']>[0],
) {
    return modelPricingTransaction(context.database, async (tx) => {
        const format =
            input.format ?? dictionaryCardAuthoringGenerationFormatV1;
        const target = input.target ?? { kind: 'create' as const };
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
                    eq(dictionaryGenerationJobsTable.kind, 'card-authoring'),
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

        if (target.kind === 'update') {
            const [card] = await tx
                .select({ version: dictionaryCardsTable.version })
                .from(dictionaryCardsTable)
                .where(
                    and(
                        eq(dictionaryCardsTable.id, target.cardId),
                        eq(
                            dictionaryCardsTable.dictionaryId,
                            input.dictionaryId,
                        ),
                        eq(dictionaryCardsTable.lifecycle, 'active'),
                    ),
                )
                .limit(1)
                .for('update');

            if (!card) throw new DictionaryCardNotFoundError();
            if (card.version !== target.expectedCardVersion)
                throw new DictionaryVersionConflictError();
        }

        const overrides = domainOverrides(input.draft.overrides);
        assertCardSettingsOverrideTransition({
            dictionary: domainSettings(current.settings),
            next: overrides,
            previous: null,
        });

        const effectiveSettings = wireEffectiveSettingsForOverrides(
            current.settings,
            overrides,
        );
        const requestedFields = resolveDictionaryCardAuthoringFields(
            effectiveSettings,
            input.scope,
            usesModernCardAuthoringSemantics(format),
        );
        const eligibleFields = resolveDictionaryCardAuthoringFields(
            effectiveSettings,
            { kind: 'all' },
            usesModernCardAuthoringSemantics(format),
        );
        const excludedValues: Array<{
            field: (typeof requestedFields)[number];
            values: string[];
        }> = [];

        if (input.predecessor) {
            const predecessor = await lockOwnedJob(
                tx,
                input.ownerId,
                input.predecessor.jobId,
            );

            if (
                predecessor.kind !== 'card-authoring' ||
                predecessor.format !== format ||
                predecessor.dictionaryId !== input.dictionaryId ||
                predecessor.expectedDictionaryVersion !==
                    current.dictionary.version ||
                predecessor.expectedSettingsVersion !==
                    current.settings.version ||
                predecessor.sourceLanguageTag !==
                    current.dictionary.sourceLanguageTag ||
                predecessor.targetLanguageTag !==
                    current.dictionary.targetLanguageTag
            )
                throw new DictionaryGenerationNotReviewableError();
            const predecessorProposal = await lockProposal(tx, predecessor.id);
            if (
                !predecessorProposal ||
                predecessorProposal.reviewState !== 'reviewable' ||
                !predecessorProposal.payload
            )
                throw new DictionaryGenerationNotReviewableError();
            if (predecessorProposal.expiresAt <= input.context.now)
                throw new DictionaryGenerationProposalExpiredError();
            const stored = DictionaryCardAuthoringProposalPayloadSchema.parse(
                predecessorProposal.payload,
            );
            const predecessorInput = predecessor.inputPayload
                ? parseDictionaryGenerationInput(predecessor.inputPayload)
                : null;
            const retainedSourceSuggestionValues = new Set(
                (stored.sourceSuggestions ?? [])
                    .filter(
                        (suggestion) =>
                            !input.predecessor!.discardedSuggestionIds.includes(
                                suggestion.id,
                            ),
                    )
                    .map((suggestion) => suggestion.value),
            );

            if (
                predecessorInput?.format !== format ||
                (predecessorInput.source !== stored.source &&
                    !(
                        usesModernCardAuthoringSemantics(format) &&
                        retainedSourceSuggestionValues.has(
                            predecessorInput.source,
                        )
                    )) ||
                (stored.source !== input.source &&
                    !(
                        usesModernCardAuthoringSemantics(format) &&
                        retainedSourceSuggestionValues.has(input.source)
                    )) ||
                (format === dictionaryCardAuthoringGenerationFormat &&
                    (predecessorInput.translationContext !==
                        resolveTranslationContext({
                            card: input.draft.translationContext ?? null,
                            dictionary: current.dictionary.translationContext,
                        }) ||
                        predecessorInput.draft.translationContext !==
                            input.draft.translationContext))
            )
                throw new DictionaryGenerationCandidateConflictError();
            const availableIds = new Set(
                [
                    ...stored.suggestions,
                    ...(stored.sourceSuggestions ?? []),
                ].map((suggestion) => suggestion.id),
            );
            const alreadyDiscardedIds = new Set(
                predecessorInput.predecessor?.discardedSuggestionIds ?? [],
            );

            if (
                input.predecessor.discardedSuggestionIds.some(
                    (id) =>
                        !availableIds.has(id) && !alreadyDiscardedIds.has(id),
                )
            )
                throw new DictionaryGenerationCandidateConflictError();
            const discarded = new Set(input.predecessor.discardedSuggestionIds);
            const historyFields = [
                ...new Set([
                    ...eligibleFields,
                    ...predecessorInput.excludedValues.map(
                        (entry) => entry.field,
                    ),
                    ...stored.suggestions.map((suggestion) => suggestion.field),
                    ...(stored.sourceSuggestions?.length
                        ? ['source' as const]
                        : []),
                ]),
            ];

            for (const field of historyFields) {
                const fieldSuggestions = stored.suggestions.filter(
                    (suggestion) => suggestion.field === field,
                );
                const sourceSuggestions =
                    field === 'source' ? (stored.sourceSuggestions ?? []) : [];
                const historicalSuggestions = [
                    ...fieldSuggestions,
                    ...sourceSuggestions,
                ];
                const remaining = historicalSuggestions.filter(
                    (suggestion) => !discarded.has(suggestion.id),
                );

                if (
                    requestedFields.includes(field) &&
                    remaining.length >=
                        dictionaryCardAuthoringSuggestionLimitPerField
                )
                    throw new DictionaryGenerationCandidateConflictError();
                const values = [
                    ...new Set([
                        ...(predecessorInput.excludedValues.find(
                            (entry) => entry.field === field,
                        )?.values ?? []),
                        ...historicalSuggestions.map(
                            (suggestion) => suggestion.value,
                        ),
                    ]),
                ];

                if (
                    values.length >
                    dictionaryCardAuthoringExcludedValueLimitPerField
                )
                    throw new DictionaryGenerationCandidateConflictError();
                if (values.length > 0) excludedValues.push({ field, values });
            }
        }

        const providerExecution = await assertGenerationAdmission(
            context,
            tx,
            input.ownerId,
            format,
            input.context.now,
        );

        abort(input.context);

        const payload =
            DictionaryCardAuthoringGenerationInputPayloadSchema.parse({
                context: {
                    dictionaryId: current.dictionary.id,
                    expectedDictionaryVersion: current.dictionary.version,
                    expectedSettingsVersion: current.settings.version,
                    sourceLanguage: current.dictionary.sourceLanguageTag,
                    targetLanguage: current.dictionary.targetLanguageTag,
                },
                draft:
                    format === dictionaryCardAuthoringGenerationFormat
                        ? input.draft
                        : {
                              overrides: input.draft.overrides,
                              values: input.draft.values,
                          },
                effectiveSettings,
                excludedValues,
                format,
                ...(usesModernCardAuthoringSemantics(format) ? { target } : {}),
                ...(format === dictionaryCardAuthoringGenerationFormat
                    ? {
                          translationContext: resolveTranslationContext({
                              card: input.draft.translationContext ?? null,
                              dictionary: current.dictionary.translationContext,
                          }),
                      }
                    : {}),
                ...(input.predecessor
                    ? { predecessor: input.predecessor }
                    : {}),
                scope: input.scope,
                source: input.source,
            }) as DictionaryCardAuthoringGenerationInputPayload;
        const [job] = await tx
            .insert(dictionaryGenerationJobsTable)
            .values({
                ...aiCreditJobValues(context, providerExecution),
                cardId: target.kind === 'update' ? target.cardId : null,
                createdAt: input.context.now,
                dictionaryId: input.dictionaryId,
                executionRevisionId: providerExecution.revisionId,
                selectedExecutionVersion: providerExecution.selectionVersion,
                selectedExecutionSnapshot: providerExecution.selectionVersion
                    ? providerExecution.snapshot
                    : null,
                expectedCardVersion:
                    target.kind === 'update'
                        ? target.expectedCardVersion
                        : null,
                expectedDictionaryVersion: input.expectedDictionaryVersion,
                expectedSettingsVersion: input.expectedSettingsVersion,
                format,
                id: context.ids.generate(),
                idempotencyKey: input.idempotencyKey,
                inputPayload: payload,
                kind: 'card-authoring',
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
