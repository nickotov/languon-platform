import { ensureActionBudgetDefault } from './action-budget-default';
import { DrizzleModelPriceParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-model-price-participant';
import { maximumTextPrice } from '../../../../ai-credits/domain/model-price';
import type { TextAiExecutionSnapshot } from '../../../application/text-ai-provider-catalog';
import { and, eq, gt } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import {
    dictionaryAiConfigurationRevisionsTable,
    dictionaryAiConfigurationTable,
    dictionaryAiWorkerObservationsTable,
} from './configuration-schema';
import {
    textAiModelCatalog,
    textAiExecutionLimits,
} from '../../../application/text-ai-provider-catalog';
import {
    TextAiSelectionUnavailableError,
    type TextAiAdmissionParticipant,
} from '../../../application/text-ai-admission-participant';
import { textAiPreferencesTable } from './schema';
import {
    isTextAiSelectionCapableObservation,
    isTextAiCapacityCapableObservation,
    isSentenceExecutionCapableObservation,
    isTextsExecutionCapableObservation,
    isConversationExecutionCapableObservation,
    isConversationCapacityCapableObservation,
    isTextsCapacityCapableObservation,
} from './text-ai-worker-readiness';
import { isTextAiCircuitOpen } from '../../../../../infrastructure/text-ai/text-ai-circuit';
import {
    hasSentenceCapacityOverlap,
    hasTextsCapacityOverlap,
    hasConversationCapacityOverlap,
} from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { sql } from 'drizzle-orm';
import {
    textAiSentenceFormats,
    textAiTextsFormats,
} from '../../../application/text-ai-provider-catalog';
import {
    defaultTextAiAvailabilityPolicy,
    type TextAiAvailabilityPolicy,
} from './text-ai-catalog-query';

type Database = PostgresJsDatabase<typeof databaseSchema>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Uses the caller's transaction: preference, admission reservation and job are one decision. */
export class DrizzleTextAiAdmissionParticipant implements TextAiAdmissionParticipant {
    public constructor(
        private readonly transaction: Transaction,
        private readonly policy: TextAiAvailabilityPolicy = defaultTextAiAvailabilityPolicy(),
        private readonly prices: Pick<
            DrizzleModelPriceParticipant,
            'current'
        > = new DrizzleModelPriceParticipant(transaction),
    ) {}
    public async resolve(
        input: Parameters<TextAiAdmissionParticipant['resolve']>[0],
    ) {
        const tx = this.transaction;
        const conversation =
            input.format === 'conversation:v1' ||
            input.format === 'portrait-interview:v1';
        const learning = textAiSentenceFormats.some(
            (format) => format === input.format,
        );
        const texts = textAiTextsFormats.some(
            (format) => format === input.format,
        );
        const conversationOverlap =
            conversation ||
            (await hasConversationCapacityOverlap(tx, input.now));
        const textsOverlap =
            texts || (await hasTextsCapacityOverlap(tx, input.now));
        const overlap =
            learning || textsOverlap || conversationOverlap
                ? true
                : await hasSentenceCapacityOverlap(tx, input.now);
        const [preference] = await tx
            .select()
            .from(textAiPreferencesTable)
            .where(eq(textAiPreferencesTable.userId, input.userId))
            .limit(1);
        const [configured] = await tx
            .select({
                id: dictionaryAiConfigurationRevisionsTable.id,
                snapshot:
                    dictionaryAiConfigurationRevisionsTable.catalogSnapshot,
            })
            .from(dictionaryAiConfigurationTable)
            .innerJoin(
                dictionaryAiConfigurationRevisionsTable,
                eq(
                    dictionaryAiConfigurationRevisionsTable.id,
                    dictionaryAiConfigurationTable.activeRevisionId,
                ),
            )
            .where(eq(dictionaryAiConfigurationTable.id, 'global'))
            .limit(1);
        if (!configured) {
            if (
                conversation ||
                learning ||
                texts ||
                preference?.mode === 'explicit'
            )
                throw new TextAiSelectionUnavailableError();
            return {
                budget: input.legacyBudget,
                revisionId: null,
                snapshot: null,
                selectionVersion: null,
            };
        }
        if (this.policy.pricingAdmissionEnabled === false)
            throw new TextAiSelectionUnavailableError();
        if (
            preference?.mode !== 'explicit' &&
            !learning &&
            !texts &&
            !conversation
        ) {
            if (
                !textAiModelCatalog.some(
                    (model) =>
                        model.id === configured.snapshot.modelId &&
                        model.providerId === configured.snapshot.providerId,
                ) ||
                !configured.snapshot.enabledModelIds.includes(
                    configured.snapshot.modelId,
                ) ||
                !configured.snapshot.supportedFormats.includes(input.format)
            )
                throw new TextAiSelectionUnavailableError();
            const observations = await tx
                .select()
                .from(dictionaryAiWorkerObservationsTable)
                .where(
                    and(
                        eq(
                            dictionaryAiWorkerObservationsTable.modelId,
                            configured.snapshot.modelId,
                        ),
                        eq(
                            dictionaryAiWorkerObservationsTable.providerId,
                            configured.snapshot.providerId,
                        ),
                        eq(
                            dictionaryAiWorkerObservationsTable.adapterRevision,
                            configured.snapshot.adapterRevision,
                        ),
                        gt(
                            dictionaryAiWorkerObservationsTable.expiresAt,
                            input.now,
                        ),
                    ),
                );
            if (
                (conversationOverlap &&
                    !observations.some(
                        (observation) =>
                            observation.status !== 'unavailable' &&
                            isConversationCapacityCapableObservation(
                                observation,
                                input.requiredWorkerFormat ?? input.format,
                            ),
                    )) ||
                observations.some(
                    (observation) => observation.status === 'unavailable',
                ) ||
                (overlap &&
                    !observations.some(
                        (observation) =>
                            observation.status !== 'unavailable' &&
                            (textsOverlap
                                ? isTextsCapacityCapableObservation
                                : isTextAiCapacityCapableObservation)(
                                observation,
                                input.requiredWorkerFormat ?? input.format,
                            ),
                    ))
            )
                throw new TextAiSelectionUnavailableError();
            const pricedSnapshot = await this.withEffectivePricing(
                configured.snapshot,
            );
            await ensureActionBudgetDefault(
                tx,
                input.userId,
                input.now,
                preference,
            );
            return {
                budget: configured.snapshot.aggregateBudget,
                revisionId: configured.id,
                snapshot: pricedSnapshot,
                selectionVersion: null,
            };
        }
        const model = textAiModelCatalog.find(
            (candidate) =>
                candidate.id ===
                (preference?.mode === 'explicit'
                    ? preference.modelId
                    : conversation
                      ? 'deepseek-flash'
                      : configured.snapshot.modelId),
        );
        if (
            !model ||
            !this.policy.routingEnabled ||
            !this.policy.credentialConfigured(model.providerId) ||
            !configured.snapshot.enabledModelIds.includes(model.id) ||
            !model.supportedFormats.includes(input.format)
        )
            throw new TextAiSelectionUnavailableError();
        const observations = await tx
            .select()
            .from(dictionaryAiWorkerObservationsTable)
            .where(
                and(
                    eq(dictionaryAiWorkerObservationsTable.modelId, model.id),
                    eq(
                        dictionaryAiWorkerObservationsTable.providerId,
                        model.providerId,
                    ),
                    eq(
                        dictionaryAiWorkerObservationsTable.adapterRevision,
                        model.adapterRevision,
                    ),
                    gt(
                        dictionaryAiWorkerObservationsTable.expiresAt,
                        input.now,
                    ),
                ),
            );
        if (
            (conversationOverlap &&
                !observations.some(
                    (observation) =>
                        observation.status !== 'unavailable' &&
                        isConversationCapacityCapableObservation(
                            observation,
                            input.requiredWorkerFormat ?? input.format,
                        ),
                )) ||
            observations.some(
                (observation) => observation.status === 'unavailable',
            ) ||
            (textsOverlap &&
                !observations.some(
                    (observation) =>
                        observation.status !== 'unavailable' &&
                        isTextsCapacityCapableObservation(
                            observation,
                            input.requiredWorkerFormat ?? input.format,
                        ),
                )) ||
            !observations.some(
                (observation) =>
                    (conversation
                        ? isConversationExecutionCapableObservation(
                              observation,
                              input.requiredWorkerFormat ?? input.format,
                          )
                        : texts
                          ? isTextsExecutionCapableObservation(
                                observation,
                                input.requiredWorkerFormat ?? input.format,
                            )
                          : learning
                            ? isSentenceExecutionCapableObservation(
                                  observation,
                                  input.requiredWorkerFormat ?? input.format,
                              )
                            : overlap
                              ? (textsOverlap
                                    ? isTextsCapacityCapableObservation
                                    : isTextAiCapacityCapableObservation)(
                                    observation,
                                    input.requiredWorkerFormat ?? input.format,
                                )
                              : isTextAiSelectionCapableObservation(
                                    observation,
                                    input.requiredWorkerFormat ?? input.format,
                                )) && observation.status !== 'unavailable',
            )
        )
            throw new TextAiSelectionUnavailableError();
        if (
            (conversation || learning || texts) &&
            (await isTextAiCircuitOpen(tx, {
                execution: { providerId: model.providerId, modelId: model.id },
                format: input.format,
                now: input.now,
            }))
        )
            throw new TextAiSelectionUnavailableError();
        if (texts) {
            await tx.execute(
                sql`select set_config('languon.texts_execution_revision','1',true), set_config('languon.text_ai_selection_revision','1',true), set_config('languon.ai_credit_settlement_revision','1',true)`,
            );
        }
        if (learning) {
            await tx.execute(
                sql`select set_config('languon.learning_execution_revision','1',true), set_config('languon.text_ai_selection_revision','1',true), set_config('languon.ai_credit_settlement_revision','1',true)`,
            );
        }
        const snapshot = {
            adapterRevision: model.adapterRevision,
            aggregateBudget: {
                ...(preference?.mode !== 'explicit' && !conversation
                    ? configured.snapshot.aggregateBudget
                    : model.aggregateBudget),
            },
            credentialReference: model.credentialReference,
            creditPricing: {
                ...(preference?.mode !== 'explicit' &&
                !conversation &&
                configured.snapshot.creditPricing
                    ? configured.snapshot.creditPricing
                    : model.creditPricing),
            },
            enabledModelIds: [...configured.snapshot.enabledModelIds],
            modelId: model.id,
            ...textAiExecutionLimits(model, [input.format]),
            providerId: model.providerId,
            supportedFormats: [input.format],
        };
        const pricedSnapshot = await this.withEffectivePricing(snapshot);
        await ensureActionBudgetDefault(
            tx,
            input.userId,
            input.now,
            preference,
        );
        return {
            budget: snapshot.aggregateBudget,
            revisionId: configured.id,
            snapshot: pricedSnapshot,
            selectionVersion: 1 as const,
        };
    }
    private async withEffectivePricing(
        snapshot: TextAiExecutionSnapshot,
    ): Promise<TextAiExecutionSnapshot> {
        const price = await this.prices.current({
            providerId: snapshot.providerId,
            modelId: snapshot.modelId,
            meter: 'text-tokens',
        });
        const rates = {
            inputCreditsPerMillionTokens: price.inputCreditsPerMillionTokens!,
            outputCreditsPerMillionTokens: price.outputCreditsPerMillionTokens!,
            cachedInputCreditsPerMillionTokens:
                price.cachedInputCreditsPerMillionTokens ?? null,
        };
        return {
            ...snapshot,
            creditPricing: {
                ...rates,
                revision: 1,
                rateRevisionId: price.rateRevisionId!,
                maxCreditsPerAttempt: maximumTextPrice(
                    snapshot.aggregateBudget,
                    rates,
                ),
            },
        };
    }
}
