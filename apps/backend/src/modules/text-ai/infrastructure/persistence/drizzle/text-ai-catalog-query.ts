import { DrizzleModelPriceParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-model-price-participant';
import type { AiCreditTransaction } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import type { TextAiModelsResponse } from '@languon/contracts';
import { desc, eq, gt } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import {
    dictionaryAiConfigurationRevisionsTable,
    dictionaryAiConfigurationTable,
    dictionaryAiWorkerObservationsTable,
} from './configuration-schema';
import { textAiModelCatalog } from '../../../application/text-ai-provider-catalog';
import { isTextAiSelectionCapableObservation } from './text-ai-worker-readiness';

export interface TextAiAvailabilityPolicy {
    routingEnabled: boolean;
    pricingAdmissionEnabled?: boolean;
    credentialConfigured(providerId: 'deepseek' | 'kie'): boolean;
}
export function defaultTextAiAvailabilityPolicy(
    environment: Readonly<Record<string, string | undefined>> = process.env,
): TextAiAvailabilityPolicy {
    const supportsPriceVersion = (value: string | undefined) =>
        value
            ?.split(',')
            .map((part) => part.trim())
            .includes('1') === true;
    return {
        pricingAdmissionEnabled:
            !['staging', 'production'].includes(environment.APP_ENV ?? '') ||
            (supportsPriceVersion(
                environment.AI_MODEL_PRICE_API_ADMITTED_VERSIONS,
            ) &&
                supportsPriceVersion(
                    environment.AI_MODEL_PRICE_WORKER_PROCESSABLE_VERSIONS,
                )),
        routingEnabled:
            environment.DICTIONARY_AI_MANAGED_ROUTING_ENABLED === 'true',
        credentialConfigured: (providerId) =>
            environment[
                providerId === 'deepseek'
                    ? 'DICTIONARY_AI_DEEPSEEK_CREDENTIAL_CONFIGURED'
                    : 'DICTIONARY_AI_KIE_CREDENTIAL_CONFIGURED'
            ] === 'true',
    };
}
export async function readTextAiCatalog(
    database: PostgresJsDatabase<typeof databaseSchema>,
    at: Date,
    policy: TextAiAvailabilityPolicy,
    mode: 'auto' | 'explicit' = 'explicit',
): Promise<TextAiModelsResponse> {
    const [configuration] = await database
        .select({
            snapshot: dictionaryAiConfigurationRevisionsTable.catalogSnapshot,
        })
        .from(dictionaryAiConfigurationTable)
        .innerJoin(
            dictionaryAiConfigurationRevisionsTable,
            eq(
                dictionaryAiConfigurationTable.activeRevisionId,
                dictionaryAiConfigurationRevisionsTable.id,
            ),
        )
        .where(eq(dictionaryAiConfigurationTable.id, 'global'))
        .for('share');
    const observations = await database
        .select()
        .from(dictionaryAiWorkerObservationsTable)
        .where(gt(dictionaryAiWorkerObservationsTable.expiresAt, at))
        .orderBy(desc(dictionaryAiWorkerObservationsTable.checkedAt));
    const prices = await database.transaction(async (tx) =>
        Promise.all(
            textAiModelCatalog.map((model) =>
                new DrizzleModelPriceParticipant(
                    tx as AiCreditTransaction,
                ).current({
                    providerId: model.providerId,
                    modelId: model.id,
                    meter: 'text-tokens',
                }),
            ),
        ),
    );
    const enabledIds = configuration?.snapshot.enabledModelIds ?? [];
    return {
        defaultModelId: configuration?.snapshot.modelId ?? null,
        models: textAiModelCatalog.map((model, index) => {
            const price = prices[index]!;
            const enabled = enabledIds.includes(model.id);
            const incompatible =
                !model.supportedCapabilities.includes('structured-text');
            const currentObservations = observations.filter(
                (observation) =>
                    observation.providerId === model.providerId &&
                    observation.modelId === model.id &&
                    observation.adapterRevision === model.adapterRevision &&
                    observation.expiresAt > at,
            );
            // Kie's bounded HEAD probe records 'unverified' when the endpoint is
            // reachable without claiming a paid completion has been exercised.
            const unavailable =
                policy.pricingAdmissionEnabled === false ||
                !policy.routingEnabled ||
                !policy.credentialConfigured(model.providerId) ||
                currentObservations.some(
                    (observation) => observation.status === 'unavailable',
                ) ||
                (mode === 'explicit' &&
                    !currentObservations.some(
                        (observation) =>
                            model.supportedFormats.some((format) =>
                                isTextAiSelectionCapableObservation(
                                    observation,
                                    format,
                                ),
                            ) && observation.status !== 'unavailable',
                    ));
            const availability = !enabled
                ? ('disabled' as const)
                : incompatible
                  ? ('incompatible' as const)
                  : unavailable
                    ? ('unavailable' as const)
                    : ('available' as const);
            return {
                id: model.id,
                label: model.label,
                enabled,
                capabilities: [...model.supportedCapabilities],
                availability,
                unavailableReason:
                    availability === 'available'
                        ? null
                        : availability === 'disabled'
                          ? 'This model is disabled. Choose another enabled model or Auto.'
                          : availability === 'incompatible'
                            ? 'This model does not support text tasks. Choose another model.'
                            : 'This model is temporarily unavailable. Choose another enabled model or try again later.',
                creditRates: {
                    inputCreditsPerMillionTokens:
                        price.inputCreditsPerMillionTokens!,
                    outputCreditsPerMillionTokens:
                        price.outputCreditsPerMillionTokens!,
                    cachedInputCreditsPerMillionTokens:
                        price.cachedInputCreditsPerMillionTokens ?? null,
                },
            };
        }),
    };
}
