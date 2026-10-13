import { describe, expect, it, vi } from 'vitest';
import { defaultTextAiAvailabilityPolicy } from '../../../../../src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-catalog-query';
import { DrizzleTextAiAdmissionParticipant } from '../../../../../src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-admission-participant';
import {
    textAiModelCatalog,
    defaultTextAiProviderBudgetPolicy,
} from '../../../../../src/modules/text-ai/application/text-ai-provider-catalog';
import { TextAiSelectionUnavailableError } from '../../../../../src/modules/text-ai/application/text-ai-admission-participant';

describe('text model tariff rollout compatibility', () => {
    it.each(['staging', 'production'])(
        'requires both API and worker declarations in %s',
        (appEnvironment) => {
            expect(
                defaultTextAiAvailabilityPolicy({ APP_ENV: appEnvironment })
                    .pricingAdmissionEnabled,
            ).toBe(false);
            expect(
                defaultTextAiAvailabilityPolicy({
                    APP_ENV: appEnvironment,
                    AI_MODEL_PRICE_API_ADMITTED_VERSIONS: '1',
                }).pricingAdmissionEnabled,
            ).toBe(false);
            expect(
                defaultTextAiAvailabilityPolicy({
                    APP_ENV: appEnvironment,
                    AI_MODEL_PRICE_WORKER_PROCESSABLE_VERSIONS: '1',
                }).pricingAdmissionEnabled,
            ).toBe(false);
            expect(
                defaultTextAiAvailabilityPolicy({
                    APP_ENV: appEnvironment,
                    AI_MODEL_PRICE_API_ADMITTED_VERSIONS: '2',
                    AI_MODEL_PRICE_WORKER_PROCESSABLE_VERSIONS: '1',
                }).pricingAdmissionEnabled,
            ).toBe(false);
            expect(
                defaultTextAiAvailabilityPolicy({
                    APP_ENV: appEnvironment,
                    AI_MODEL_PRICE_API_ADMITTED_VERSIONS: ' 1 ',
                    AI_MODEL_PRICE_WORKER_PROCESSABLE_VERSIONS: '1',
                }).pricingAdmissionEnabled,
            ).toBe(true);
        },
    );
    it('enables local and fixture runs without deployment declarations', () => {
        expect(
            defaultTextAiAvailabilityPolicy({ APP_ENV: 'development' })
                .pricingAdmissionEnabled,
        ).toBe(true);
        expect(
            defaultTextAiAvailabilityPolicy({ APP_ENV: 'test' })
                .pricingAdmissionEnabled,
        ).toBe(true);
    });
    it('rejects managed admission before tariff lookup or job creation when deployment compatibility is absent', async () => {
        const model = textAiModelCatalog[0]!;
        const current = vi.fn();
        const results = [
            [],
            [
                {
                    id: '11111111-1111-4111-8111-111111111111',
                    snapshot: {
                        adapterRevision: model.adapterRevision,
                        aggregateBudget: model.aggregateBudget,
                        credentialReference: model.credentialReference,
                        creditPricing: model.creditPricing,
                        enabledModelIds: [model.id],
                        modelId: model.id,
                        providerId: model.providerId,
                        perCallMaxInputTokens: model.perCallMaxInputTokens,
                        perCallMaxOutputTokens: model.perCallMaxOutputTokens,
                        supportedFormats: model.supportedFormats,
                    },
                },
            ],
        ];
        const select = () => {
            const result = results.shift() ?? [];
            const chain = {
                from: () => chain,
                where: () => chain,
                limit: () => chain,
                innerJoin: () => chain,
                then: (resolve: (value: unknown[]) => unknown) =>
                    Promise.resolve(result).then(resolve),
            };
            return chain;
        };
        const database = {
            select,
            execute: vi.fn().mockResolvedValue([]),
        } as unknown as ConstructorParameters<
            typeof DrizzleTextAiAdmissionParticipant
        >[0];
        const participant = new DrizzleTextAiAdmissionParticipant(
            database,
            {
                routingEnabled: true,
                credentialConfigured: () => true,
                pricingAdmissionEnabled: false,
            },
            { current },
        );
        await expect(
            participant.resolve({
                userId: 'actor',
                format: 'single-card:v2',
                now: new Date(),
                legacyBudget: defaultTextAiProviderBudgetPolicy,
            }),
        ).rejects.toBeInstanceOf(TextAiSelectionUnavailableError);
        expect(current).not.toHaveBeenCalled();
    });
});
