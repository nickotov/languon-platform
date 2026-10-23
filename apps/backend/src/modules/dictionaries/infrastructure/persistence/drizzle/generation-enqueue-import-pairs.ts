import { withActionBilling } from '../../../../ai-credits/infrastructure/persistence/drizzle/action-billing';
import { modelPricingTransaction } from '../../../../ai-credits/infrastructure/price-aware-transaction';
import { lockTextAiCapacity } from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { DictionaryAiImportResponseSchema } from '@languon/contracts';
import { and, count, eq, lte, sql } from 'drizzle-orm';
import {
    DictionaryGenerationNotAvailableError,
    DictionaryIdempotencyConflictError,
    DictionaryNotFoundError,
    DictionaryVersionConflictError,
} from '../../../application/dictionary-errors';
import type { DictionaryGenerationStore } from '../../../application/ports/dictionary-generation-store';
import {
    dictionaryImportPairsGenerationFormat,
    parseDictionaryGenerationInput,
} from '../../../domain/generation';
import {
    assertDictionaryOwnerCapacity,
    dictionaryLimits,
    normalizeDictionaryDetails,
} from '../../../domain/limits';
import { defaultDictionarySettings } from '../../../domain/settings';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    dictionariesTable,
    dictionaryCardRevisionsTable,
    dictionaryCardsTable,
    dictionaryGenerationJobsTable,
    dictionaryIdempotencyKeysTable,
    dictionarySettingsTable,
} from './schema';
import type { GenerationStoreContext, SettingsRow } from './generation-context';
import { abort, bulkIdempotencyLifetimeMs } from './generation-context';
import { wireEffectiveSettings } from './generation-card-snapshots';
import { assertGenerationAdmission } from './generation-admission';
import {
    aiCreditJobValues,
    reserveInitialAiCreditAttempt,
} from './generation-accounting';
import { mapOwnedDictionary, mapJob } from './generation-job-mapping';

export async function enqueueImportPairs(
    context: GenerationStoreContext,
    input: Parameters<DictionaryGenerationStore['enqueueImportPairs']>[0],
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

        await tx
            .delete(dictionaryIdempotencyKeysTable)
            .where(
                and(
                    eq(dictionaryIdempotencyKeysTable.ownerId, input.ownerId),
                    eq(dictionaryIdempotencyKeysTable.operation, 'bulk_commit'),
                    eq(
                        dictionaryIdempotencyKeysTable.idempotencyKey,
                        input.idempotencyKey,
                    ),
                    lte(
                        dictionaryIdempotencyKeysTable.expiresAt,
                        input.context.now,
                    ),
                ),
            );

        await tx.execute(sql`
                delete from ${dictionaryIdempotencyKeysTable}
                where ${dictionaryIdempotencyKeysTable.id} in (
                    select ${dictionaryIdempotencyKeysTable.id}
                    from ${dictionaryIdempotencyKeysTable}
                    where ${dictionaryIdempotencyKeysTable.expiresAt} <= ${input.context.now.toISOString()}::timestamptz
                    order by ${dictionaryIdempotencyKeysTable.expiresAt}
                    limit 100
                    for update skip locked
                )
            `);

        const [reserved] = await tx
            .insert(dictionaryIdempotencyKeysTable)
            .values({
                createdAt: input.context.now,
                expiresAt: new Date(
                    input.context.now.getTime() + bulkIdempotencyLifetimeMs,
                ),
                id: context.ids.generate(),
                idempotencyKey: input.idempotencyKey,
                operation: 'bulk_commit',
                ownerId: input.ownerId,
                requestFingerprint: input.fingerprint,
                updatedAt: input.context.now,
            })
            .onConflictDoNothing({
                target: [
                    dictionaryIdempotencyKeysTable.ownerId,
                    dictionaryIdempotencyKeysTable.operation,
                    dictionaryIdempotencyKeysTable.idempotencyKey,
                ],
            })
            .returning({ id: dictionaryIdempotencyKeysTable.id });

        if (!reserved) {
            const [existing] = await tx
                .select()
                .from(dictionaryIdempotencyKeysTable)
                .where(
                    and(
                        eq(
                            dictionaryIdempotencyKeysTable.ownerId,
                            input.ownerId,
                        ),
                        eq(
                            dictionaryIdempotencyKeysTable.operation,
                            'bulk_commit',
                        ),
                        eq(
                            dictionaryIdempotencyKeysTable.idempotencyKey,
                            input.idempotencyKey,
                        ),
                    ),
                )
                .limit(1)
                .for('update');

            if (
                !existing ||
                existing.requestFingerprint !== input.fingerprint ||
                existing.state !== 'completed' ||
                !existing.resultPayload
            )
                throw new DictionaryIdempotencyConflictError();
            const replay = DictionaryAiImportResponseSchema.safeParse(
                existing.resultPayload,
            );

            if (!replay.success) throw new DictionaryIdempotencyConflictError();

            return replay.data;
        }

        let current: {
            dictionary: typeof dictionariesTable.$inferSelect;
            settings: SettingsRow;
        };

        if (input.target.kind === 'new') {
            const [dictionaryCount] = await tx
                .select({ value: count() })
                .from(dictionariesTable)
                .where(eq(dictionariesTable.ownerId, input.ownerId));
            const [cardCount] = await tx
                .select({ value: count() })
                .from(dictionaryCardsTable)
                .innerJoin(
                    dictionariesTable,
                    eq(dictionaryCardsTable.dictionaryId, dictionariesTable.id),
                )
                .where(eq(dictionariesTable.ownerId, input.ownerId));
            const [revisionCount] = await tx
                .select({ value: count() })
                .from(dictionaryCardRevisionsTable)
                .innerJoin(
                    dictionariesTable,
                    eq(
                        dictionaryCardRevisionsTable.dictionaryId,
                        dictionariesTable.id,
                    ),
                )
                .where(eq(dictionariesTable.ownerId, input.ownerId));

            assertDictionaryOwnerCapacity(
                {
                    cards: Number(cardCount?.value ?? 0),
                    dictionaries: Number(dictionaryCount?.value ?? 0),
                    revisions: Number(revisionCount?.value ?? 0),
                },
                { cards: 0, dictionaries: 1, revisions: 0 },
                dictionaryLimits,
            );

            const details = normalizeDictionaryDetails(input.target);
            const dictionaryId = context.ids.generate();
            const [dictionary] = await tx
                .insert(dictionariesTable)
                .values({
                    createdAt: input.context.now,
                    description: details.description,
                    id: dictionaryId,
                    name: details.name,
                    ownerId: input.ownerId,
                    sourceLanguageTag: input.target.sourceLanguage,
                    targetLanguageTag: input.target.targetLanguage,
                    updatedAt: input.context.now,
                })
                .returning();
            const [settings] = await tx
                .insert(dictionarySettingsTable)
                .values({
                    createdAt: input.context.now,
                    customNotationLabel:
                        defaultDictionarySettings.customNotationLabel,
                    definitionEnabled:
                        defaultDictionarySettings.definitionEnabled,
                    definitionLanguageRole:
                        defaultDictionarySettings.definitionLanguageRole,
                    dictionaryId,
                    exampleEnabled: defaultDictionarySettings.exampleEnabled,
                    exampleLanguageRole:
                        defaultDictionarySettings.exampleLanguageRole,
                    exampleTranslationEnabled:
                        defaultDictionarySettings.exampleTranslationEnabled,
                    transcriptionEnabled:
                        defaultDictionarySettings.transcriptionEnabled,
                    transcriptionNotation:
                        defaultDictionarySettings.transcriptionNotation,
                    updatedAt: input.context.now,
                })
                .returning();

            if (!dictionary || !settings)
                throw new DictionaryVersionConflictError();
            current = { dictionary, settings };
        } else {
            const [existing] = await tx
                .select({
                    dictionary: dictionariesTable,
                    settings: dictionarySettingsTable,
                })
                .from(dictionariesTable)
                .innerJoin(
                    dictionarySettingsTable,
                    eq(
                        dictionarySettingsTable.dictionaryId,
                        dictionariesTable.id,
                    ),
                )
                .where(
                    and(
                        eq(dictionariesTable.id, input.target.dictionaryId),
                        eq(dictionariesTable.ownerId, input.ownerId),
                    ),
                )
                .limit(1)
                .for('update', { of: dictionariesTable });

            if (!existing) throw new DictionaryNotFoundError();
            await tx
                .select({
                    dictionaryId: dictionarySettingsTable.dictionaryId,
                })
                .from(dictionarySettingsTable)
                .where(
                    eq(
                        dictionarySettingsTable.dictionaryId,
                        existing.dictionary.id,
                    ),
                )
                .limit(1)
                .for('update');

            if (
                existing.dictionary.lifecycle !== 'active' ||
                existing.dictionary.version !==
                    input.target.expectedDictionaryVersion ||
                existing.settings.version !==
                    input.target.expectedSettingsVersion
            )
                throw new DictionaryVersionConflictError();
            current = existing;
        }

        const effectiveSettings = wireEffectiveSettings(current.settings);
        if (
            !effectiveSettings.transcriptionEnabled &&
            !effectiveSettings.definitionEnabled &&
            !effectiveSettings.exampleEnabled &&
            !effectiveSettings.exampleTranslationEnabled
        )
            throw new DictionaryGenerationNotAvailableError();

        const providerExecution = await assertGenerationAdmission(
            context,
            tx,
            input.ownerId,
            dictionaryImportPairsGenerationFormat,
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
            effectiveSettings,
            format: dictionaryImportPairsGenerationFormat,
            importFingerprint: input.importFingerprint,
            instruction: input.instruction,
            rows: input.rows.map((row) => ({
                lineage: {
                    importFingerprint: input.importFingerprint,
                    importedRowIndex: row.rowIndex,
                },
                ...row,
            })),
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

        const [counts] = await tx
            .select({
                active: sql<number>`count(*) filter (where ${dictionaryCardsTable.lifecycle} = 'active')`,
                retained: count(),
            })
            .from(dictionaryCardsTable)
            .where(
                eq(dictionaryCardsTable.dictionaryId, current.dictionary.id),
            );
        const response = DictionaryAiImportResponseSchema.parse({
            dictionary: mapOwnedDictionary(
                current.dictionary,
                current.settings,
                Number(counts?.active ?? 0),
                Number(counts?.retained ?? 0),
            ),
            job: await withActionBilling(
                tx,
                mapJob(job, null),
                job.id,
                job.ownerId,
            ),
            mode: 'ai',
        });
        const completed = await tx
            .update(dictionaryIdempotencyKeysTable)
            .set({
                completedAt: input.context.now,
                resultDictionaryId: current.dictionary.id,
                resultPayload: response,
                state: 'completed',
                updatedAt: input.context.now,
            })
            .where(
                and(
                    eq(dictionaryIdempotencyKeysTable.id, reserved.id),
                    eq(dictionaryIdempotencyKeysTable.state, 'in_progress'),
                ),
            )
            .returning({ id: dictionaryIdempotencyKeysTable.id });

        if (completed.length !== 1)
            throw new DictionaryIdempotencyConflictError();

        return response;
    });
}
