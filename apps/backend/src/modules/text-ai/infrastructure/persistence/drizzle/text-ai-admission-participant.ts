import { and, eq, gt } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import {
    dictionaryAiConfigurationRevisionsTable,
    dictionaryAiConfigurationTable,
    dictionaryAiWorkerObservationsTable,
} from './configuration-schema';
import { textAiModelCatalog } from '../../../application/text-ai-provider-catalog';
import {
    TextAiSelectionUnavailableError,
    type TextAiAdmissionParticipant,
} from '../../../application/text-ai-admission-participant';
import { textAiPreferencesTable } from './schema';
import {
    isTextAiSelectionCapableObservation,
    isTextAiCapacityCapableObservation,
    isSentenceExecutionCapableObservation,
} from './text-ai-worker-readiness';
import { isTextAiCircuitOpen } from '../../../../../infrastructure/text-ai/text-ai-circuit';
import { hasSentenceCapacityOverlap } from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { sql } from 'drizzle-orm';
import { textAiSentenceFormats } from '../../../application/text-ai-provider-catalog';
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
    ) {}
    public async resolve(
        input: Parameters<TextAiAdmissionParticipant['resolve']>[0],
    ) {
        const tx = this.transaction;
        const learning = textAiSentenceFormats.some(
            (format) => format === input.format,
        );
        const overlap = learning
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
            if (learning || preference?.mode === 'explicit')
                throw new TextAiSelectionUnavailableError();
            return {
                budget: input.legacyBudget,
                revisionId: null,
                snapshot: null,
                selectionVersion: null,
            };
        }
        if (preference?.mode !== 'explicit' && !learning) {
            if (
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
                observations.some(
                    (observation) => observation.status === 'unavailable',
                ) ||
                (overlap &&
                    !observations.some(
                        (observation) =>
                            observation.status !== 'unavailable' &&
                            isTextAiCapacityCapableObservation(
                                observation,
                                input.format,
                            ),
                    ))
            )
                throw new TextAiSelectionUnavailableError();
            return {
                budget: configured.snapshot.aggregateBudget,
                revisionId: configured.id,
                snapshot: configured.snapshot,
                selectionVersion: null,
            };
        }
        const model = textAiModelCatalog.find(
            (candidate) =>
                candidate.id ===
                (preference?.mode === 'explicit'
                    ? preference.modelId
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
            observations.some(
                (observation) => observation.status === 'unavailable',
            ) ||
            !observations.some(
                (observation) =>
                    (learning
                        ? isSentenceExecutionCapableObservation(
                              observation,
                              input.format,
                          )
                        : overlap
                          ? isTextAiCapacityCapableObservation(
                                observation,
                                input.format,
                            )
                          : isTextAiSelectionCapableObservation(
                                observation,
                                input.format,
                            )) && observation.status !== 'unavailable',
            )
        )
            throw new TextAiSelectionUnavailableError();
        if (
            learning &&
            (await isTextAiCircuitOpen(tx, {
                execution: { providerId: model.providerId, modelId: model.id },
                format: input.format,
                now: input.now,
            }))
        )
            throw new TextAiSelectionUnavailableError();
        if (learning) {
            await tx.execute(
                sql`select set_config('languon.learning_execution_revision','1',true), set_config('languon.text_ai_selection_revision','1',true), set_config('languon.ai_credit_settlement_revision','1',true)`,
            );
        }
        const snapshot = {
            adapterRevision: model.adapterRevision,
            aggregateBudget: {
                ...(preference?.mode !== 'explicit'
                    ? configured.snapshot.aggregateBudget
                    : model.aggregateBudget),
            },
            credentialReference: model.credentialReference,
            creditPricing: {
                ...(preference?.mode !== 'explicit' &&
                configured.snapshot.creditPricing
                    ? configured.snapshot.creditPricing
                    : model.creditPricing),
            },
            enabledModelIds: [...configured.snapshot.enabledModelIds],
            modelId: model.id,
            perCallMaxInputTokens: model.perCallMaxInputTokens,
            perCallMaxOutputTokens: model.perCallMaxOutputTokens,
            providerId: model.providerId,
            supportedFormats: [input.format],
        };
        return {
            budget: snapshot.aggregateBudget,
            revisionId: configured.id,
            snapshot,
            selectionVersion: 1 as const,
        };
    }
}
