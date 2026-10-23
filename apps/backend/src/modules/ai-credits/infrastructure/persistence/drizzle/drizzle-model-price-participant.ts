import { AdminAccessDeniedError } from '../../../../administration/application/administration-errors';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    dictionaryAiConfigurationTable,
    dictionaryAiConfigurationRevisionsTable,
} from '../../../../text-ai/infrastructure/persistence/drizzle/configuration-schema';
import {
    adminAuditEventsTable,
    adminMembershipsTable,
} from '../../../../administration/infrastructure/persistence/drizzle/schema';
import { isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
    ModelPricePublishRequestSchema,
    type ModelPrice,
} from '@languon/contracts';
import type { z } from 'zod';
import type { AiCreditTransaction } from './drizzle-ai-credit-participant';
import { modelPriceRevisionsTable } from './model-price-schema';
import { textAiModelCatalog } from '../../../../text-ai/application/text-ai-provider-catalog';
import { SPEECH_MODEL_CATALOG } from '../../../../speech/domain/speech-models';

export class ModelPriceConflictError extends Error {}
export class ModelPriceUnavailableError extends Error {}
type Publish = z.infer<typeof ModelPricePublishRequestSchema>;
export const initialSpeechModels = SPEECH_MODEL_CATALOG.map(
    ({ providerId, modelId }) => ({ providerId, modelId }),
);
export class DrizzleModelPriceParticipant {
    public constructor(private readonly transaction: AiCreditTransaction) {}
    public async current(input: {
        providerId: string;
        modelId: string;
        meter: ModelPrice['meter'];
    }): Promise<ModelPrice> {
        const t = modelPriceRevisionsTable;
        let [row] = await this.transaction
            .select()
            .from(t)
            .where(
                and(
                    eq(t.providerId, input.providerId),
                    eq(t.modelId, input.modelId),
                ),
            )
            .orderBy(desc(t.version))
            .limit(1);

        if (!row) {
            // Existing published revisions are immutable: readers must not
            // serialize behind a model-wide publication lock. Only legacy
            // bootstrap needs coordination; publication still locks writes.
            await this.transaction.execute(
                sql`select pg_advisory_xact_lock(hashtextextended(${input.providerId + '/' + input.modelId}, 1920424382))`,
            );

            [row] = await this.transaction
                .select()
                .from(t)
                .where(
                    and(
                        eq(t.providerId, input.providerId),
                        eq(t.modelId, input.modelId),
                    ),
                )
                .orderBy(desc(t.version))
                .limit(1);
        }

        if (!row) {
            let seed = this.seed(input);
            if (input.meter === 'text-tokens') {
                const [configuration] = await this.transaction
                    .select({
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

                if (
                    configuration?.snapshot.providerId === input.providerId &&
                    configuration.snapshot.modelId === input.modelId &&
                    configuration.snapshot.creditPricing
                )
                    seed = {
                        ...seed,
                        inputCreditsPerMillionTokens:
                            configuration.snapshot.creditPricing
                                .inputCreditsPerMillionTokens,
                        outputCreditsPerMillionTokens:
                            configuration.snapshot.creditPricing
                                .outputCreditsPerMillionTokens,
                    };
            }

            await this.transaction
                .insert(t)
                .values({
                    id: randomUUID(),
                    ...input,
                    version: 1,
                    rates: seed,
                    createdAt: new Date(),
                    reason: 'Initial curated model tariff',
                    createdBy: null,
                })
                .onConflictDoNothing();

            [row] = await this.transaction
                .select()
                .from(t)
                .where(
                    and(
                        eq(t.providerId, input.providerId),
                        eq(t.modelId, input.modelId),
                    ),
                )
                .orderBy(desc(t.version))
                .limit(1);
        }

        if (!row || row.meter !== input.meter)
            throw new ModelPriceUnavailableError();

        return {
            providerId: row.providerId,
            modelId: row.modelId,
            meter: input.meter,
            version: row.version,
            rateRevisionId: row.id,
            ...row.rates,
            cachedInputCreditsPerMillionTokens:
                row.rates.cachedInputCreditsPerMillionTokens ?? null,
            updatedAt: row.createdAt.toISOString(),
        };
    }

    public async list(): Promise<ModelPrice[]> {
        return Promise.all(
            [
                ...textAiModelCatalog.map((m) => ({
                    providerId: m.providerId,
                    modelId: m.id,
                    meter: 'text-tokens' as const,
                })),
                ...initialSpeechModels.map((m) => ({
                    ...m,
                    meter: 'speech-characters' as const,
                })),
            ].map((input) => this.current(input)),
        );
    }

    public async publish(
        input: Publish,
        actorId: string,
        at: Date,
        correlationId: string = randomUUID(),
    ): Promise<ModelPrice> {
        input = ModelPricePublishRequestSchema.parse(input);
        const [membership] = await this.transaction
            .select({ role: adminMembershipsTable.role })
            .from(adminMembershipsTable)
            .innerJoin(
                usersTable,
                eq(usersTable.id, adminMembershipsTable.userId),
            )
            .where(
                and(
                    eq(adminMembershipsTable.userId, actorId),
                    isNull(adminMembershipsTable.revokedAt),
                    eq(usersTable.status, 'active'),
                ),
            )
            .for('share');

        if (!membership || membership.role !== 'owner')
            throw new AdminAccessDeniedError();
        this.seed(input);
        await this.transaction.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${input.providerId + '/' + input.modelId}, 1920424382))`,
        );

        const current = await this.current(input);
        if (current.version !== input.expectedVersion)
            throw new ModelPriceConflictError();
        const rates = {
            creditsPer1000Characters: input.creditsPer1000Characters,
            minimumCredits: input.minimumCredits,
            inputCreditsPerMillionTokens: input.inputCreditsPerMillionTokens,
            outputCreditsPerMillionTokens: input.outputCreditsPerMillionTokens,
            cachedInputCreditsPerMillionTokens:
                input.cachedInputCreditsPerMillionTokens ?? null,
            provisional: input.provisional,
        };

        if (
            input.meter === 'speech-characters'
                ? rates.creditsPer1000Characters === null ||
                  rates.creditsPer1000Characters <= 0 ||
                  rates.minimumCredits === null ||
                  rates.minimumCredits < 0 ||
                  rates.inputCreditsPerMillionTokens !== null ||
                  rates.outputCreditsPerMillionTokens !== null ||
                  rates.cachedInputCreditsPerMillionTokens !== null
                : rates.inputCreditsPerMillionTokens === null ||
                  rates.outputCreditsPerMillionTokens === null ||
                  (rates.inputCreditsPerMillionTokens === 0 &&
                      rates.outputCreditsPerMillionTokens === 0) ||
                  rates.minimumCredits !== null ||
                  rates.creditsPer1000Characters !== null
        )
            throw new ModelPriceUnavailableError('Invalid rates for meter.');
        await this.transaction.insert(modelPriceRevisionsTable).values({
            id: randomUUID(),
            providerId: input.providerId,
            modelId: input.modelId,
            meter: input.meter,
            version: current.version + 1,
            rates,
            createdAt: at,
            createdBy: actorId,
            reason: input.reason,
        });

        const result = await this.current(input);
        await this.transaction.insert(adminAuditEventsTable).values({
            id: randomUUID(),
            actorUserId: actorId,
            action: 'ai_model_price_published',
            outcome: 'success',
            reason: input.reason,
            correlationId,
            occurredAt: at,
            expiresAt: new Date(at.getTime() + 365 * 24 * 60 * 60 * 1000),
            beforeVersion: current.version,
            afterVersion: result.version,
            metadata: {
                providerId: input.providerId,
                modelId: input.modelId,
                meter: input.meter,
                rateRevisionId: result.rateRevisionId,
            },
        });

        return result;
    }

    private seed(input: {
        providerId: string;
        modelId: string;
        meter: ModelPrice['meter'];
    }): Pick<
        ModelPrice,
        | 'creditsPer1000Characters'
        | 'minimumCredits'
        | 'inputCreditsPerMillionTokens'
        | 'outputCreditsPerMillionTokens'
        | 'cachedInputCreditsPerMillionTokens'
        | 'provisional'
    > {
        if (
            input.meter === 'speech-characters' &&
            initialSpeechModels.some(
                (m) =>
                    m.providerId === input.providerId &&
                    m.modelId === input.modelId,
            )
        )
            return {
                creditsPer1000Characters: 100,
                minimumCredits: 1,
                inputCreditsPerMillionTokens: null,
                outputCreditsPerMillionTokens: null,
                cachedInputCreditsPerMillionTokens: null,
                provisional: true,
            };
        const model = textAiModelCatalog.find(
            (m) => m.providerId === input.providerId && m.id === input.modelId,
        );

        if (!model || input.meter !== 'text-tokens')
            throw new ModelPriceUnavailableError('Model is not curated.');

        return {
            creditsPer1000Characters: null,
            minimumCredits: null,
            inputCreditsPerMillionTokens:
                model.creditPricing.inputCreditsPerMillionTokens,
            outputCreditsPerMillionTokens:
                model.creditPricing.outputCreditsPerMillionTokens,
            cachedInputCreditsPerMillionTokens: null,
            provisional: false,
        };
    }
}
