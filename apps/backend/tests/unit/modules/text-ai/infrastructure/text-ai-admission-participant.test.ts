import { describe, expect, it } from 'vitest';
import {
    textAiModelCatalog,
    defaultTextAiProviderBudgetPolicy,
} from '../../../../../src/modules/text-ai/application/text-ai-provider-catalog';
import { TextAiSelectionUnavailableError } from '../../../../../src/modules/text-ai/application/text-ai-admission-participant';
import { DrizzleTextAiAdmissionParticipant } from '../../../../../src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-admission-participant';
import { resolveTextAiExecutionSnapshot } from '../../../../../src/modules/text-ai/infrastructure/ai/text-ai-provider-resolver';

import { sentenceExecutionObservationId } from '../../../../../src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-worker-readiness';

const now = new Date('2026-10-04T10:00:00Z');
const [defaultModel, selectedModel] = textAiModelCatalog;
function snapshot(model = defaultModel!) {
    return {
        adapterRevision: model.adapterRevision,
        aggregateBudget: model.aggregateBudget,
        credentialReference: model.credentialReference,
        creditPricing: model.creditPricing,
        enabledModelIds: textAiModelCatalog.map((item) => item.id),
        modelId: model.id,
        perCallMaxInputTokens: model.perCallMaxInputTokens,
        perCallMaxOutputTokens: model.perCallMaxOutputTokens,
        providerId: model.providerId,
        supportedFormats: [...model.supportedFormats],
    };
}
function database(results: unknown[][], overlap = false) {
    return {
        execute: async () => [{ overlap }],
        select() {
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
        },
    } as unknown as ConstructorParameters<
        typeof DrizzleTextAiAdmissionParticipant
    >[0];
}
function participant(
    results: unknown[][],
    overlap = false,
    rates?: {
        inputCreditsPerMillionTokens: number;
        outputCreditsPerMillionTokens: number;
    },
) {
    return new DrizzleTextAiAdmissionParticipant(
        database(results, overlap),
        {
            routingEnabled: true,
            credentialConfigured: () => true,
        },
        {
            current: async (request) => {
                const model = textAiModelCatalog.find(
                    (model) =>
                        model.providerId === request.providerId &&
                        model.id === request.modelId,
                )!;
                return {
                    ...request,
                    version: 2,
                    rateRevisionId: '11111111-1111-4111-8111-111111111111',
                    creditsPer1000Characters: null,
                    minimumCredits: null,
                    inputCreditsPerMillionTokens:
                        model.creditPricing.inputCreditsPerMillionTokens,
                    outputCreditsPerMillionTokens:
                        model.creditPricing.outputCreditsPerMillionTokens,
                    ...rates,
                    provisional: false,
                    updatedAt: now.toISOString(),
                };
            },
        },
    );
}
const input = {
    userId: 'learner',
    format: 'single-card:v2',
    now,
    legacyBudget: defaultTextAiProviderBudgetPolicy,
};
describe('transactional text AI admission selection', () => {
    it('pins published rates for Auto admissions independently of the configured catalog snapshot', async () => {
        const published = {
            inputCreditsPerMillionTokens: 2000000,
            outputCreditsPerMillionTokens: 0,
        };
        const execution = await participant(
            [[], [{ id: 'global-revision', snapshot: snapshot() }], []],
            false,
            published,
        ).resolve(input);
        expect(execution.snapshot?.creditPricing).toMatchObject({
            ...published,
            revision: 1,
            rateRevisionId: '11111111-1111-4111-8111-111111111111',
        });
        expect(execution.snapshot?.creditPricing?.maxCreditsPerAttempt).toBe(
            524288,
        );
        expect(
            resolveTextAiExecutionSnapshot(
                execution.snapshot!,
                execution.budget,
            ).id,
        ).toBe(defaultModel!.id);
    });

    it('uses platform default for missing preference and preserves legacy without configuration', async () => {
        const configured = await participant([
            [],
            [{ id: 'global-revision', snapshot: snapshot() }],
            [],
        ]).resolve(input);
        expect(configured.snapshot?.modelId).toBe(defaultModel!.id);
        expect(configured.selectionVersion).toBeNull();
        const legacy = await participant([[], []]).resolve(input);
        expect(legacy.snapshot).toBeNull();
        expect(legacy.budget).toEqual(defaultTextAiProviderBudgetPolicy);
    });
    it('rejects a known unavailable Auto default without requiring selected-worker capability', async () => {
        await expect(
            participant([
                [],
                [{ id: 'global-revision', snapshot: snapshot() }],
                [{ status: 'unavailable', textAiSelectionRevision: null }],
            ]).resolve(input),
        ).rejects.toBeInstanceOf(TextAiSelectionUnavailableError);
    });
    it('pins explicit model execution and pricing while retaining global provenance', async () => {
        const execution = await participant([
            [{ mode: 'explicit', modelId: selectedModel!.id }],
            [{ id: 'global-revision', snapshot: snapshot() }],
            [
                {
                    textAiSelectionRevision: 1,
                    status: 'unverified',
                    workerId: 'capable-worker',
                    providerId: selectedModel!.providerId,
                    modelId: selectedModel!.id,
                    id: `capable-worker/${selectedModel!.providerId}/${selectedModel!.id}/text-ai-selection:v1`,
                    textAiSupportedFormats: [input.format],
                },
            ],
        ]).resolve(input);
        expect(execution.selectionVersion).toBe(1);
        expect(execution.revisionId).toBe('global-revision');
        expect(execution.snapshot?.modelId).toBe(selectedModel!.id);
        expect(execution.snapshot?.creditPricing).toMatchObject({
            revision: 1,
            rateRevisionId: '11111111-1111-4111-8111-111111111111',
            inputCreditsPerMillionTokens:
                selectedModel!.creditPricing.inputCreditsPerMillionTokens,
            outputCreditsPerMillionTokens:
                selectedModel!.creditPricing.outputCreditsPerMillionTokens,
        });
        expect(execution.budget).toEqual(selectedModel!.aggregateBudget);
        expect(execution.snapshot?.supportedFormats).toEqual([input.format]);
        expect(execution.snapshot?.providerId).toBe(selectedModel!.providerId);
        expect(execution.snapshot?.adapterRevision).toBe(
            selectedModel!.adapterRevision,
        );
        expect(execution.snapshot?.perCallMaxInputTokens).toBe(
            selectedModel!.perCallMaxInputTokens,
        );
        expect(execution.snapshot?.perCallMaxOutputTokens).toBe(
            selectedModel!.perCallMaxOutputTokens,
        );
    });
    it.each([
        { observations: [] },
        {
            observations: [
                { textAiSelectionRevision: null, status: 'available' },
            ],
        },
        {
            observations: [
                { textAiSelectionRevision: 1, status: 'unavailable' },
            ],
        },
    ])(
        'fails closed when selected model has no ready capable worker (%j)',
        async ({ observations }) => {
            await expect(
                participant([
                    [{ mode: 'explicit', modelId: selectedModel!.id }],
                    [{ id: 'global-revision', snapshot: snapshot() }],
                    observations,
                ]).resolve(input),
            ).rejects.toBeInstanceOf(TextAiSelectionUnavailableError);
        },
    );
    it('does not fall back from disabled explicit selection', async () => {
        const configured = snapshot();
        configured.enabledModelIds = [defaultModel!.id];
        await expect(
            participant([
                [{ mode: 'explicit', modelId: selectedModel!.id }],
                [{ id: 'global-revision', snapshot: configured }],
            ]).resolve(input),
        ).rejects.toBeInstanceOf(TextAiSelectionUnavailableError);
    });
    it('learning Auto pins selection only with exact learning/settlement/capacity capability', async () => {
        const model = defaultModel!;
        const format = 'sentence-generation:v1';
        const workerId = 'learning-worker';
        const observation = {
            id: sentenceExecutionObservationId(
                workerId,
                model.providerId,
                model.id,
            ),
            workerId,
            providerId: model.providerId,
            modelId: model.id,
            status: 'available',
            textAiSelectionRevision: 1,
            textAiCapacityRevision: 1,
            learningExecutionRevision: 1,
            creditSettlementRevision: 1,
            textAiSupportedFormats: [format],
        };
        const result = await participant([
            [],
            [{ id: 'global', snapshot: snapshot() }],
            [observation],
        ]).resolve({ ...input, format });
        expect(result.selectionVersion).toBe(1);
        expect(result.snapshot?.supportedFormats).toEqual([format]);
        await expect(
            participant([
                [],
                [{ id: 'global', snapshot: snapshot() }],
                [observation],
                [{ openUntil: new Date(now.getTime() + 60_000) }],
            ]).resolve({ ...input, format }),
        ).rejects.toBeInstanceOf(TextAiSelectionUnavailableError);
        await expect(
            participant([
                [],
                [{ id: 'global', snapshot: snapshot() }],
                [{ ...observation, creditSettlementRevision: null }],
            ]).resolve({ ...input, format }),
        ).rejects.toBeInstanceOf(TextAiSelectionUnavailableError);
    });
    it('rejects dictionary Auto from selection-only workers while sentence usage overlaps', async () => {
        const model = defaultModel!;
        await expect(
            participant(
                [
                    [],
                    [{ id: 'global', snapshot: snapshot() }],
                    [
                        {
                            id: `old/${model.providerId}/${model.id}/text-ai-selection:v1`,
                            workerId: 'old',
                            providerId: model.providerId,
                            modelId: model.id,
                            textAiSelectionRevision: 1,
                            status: 'available',
                            textAiSupportedFormats: [input.format],
                        },
                    ],
                ],
                true,
            ).resolve(input),
        ).rejects.toBeInstanceOf(TextAiSelectionUnavailableError);
    });
    it('executes historical credit rates even after curated prices change', () => {
        const historical = snapshot();
        historical.creditPricing = {
            ...historical.creditPricing,
            inputCreditsPerMillionTokens: 123,
            outputCreditsPerMillionTokens: 456,
            maxCreditsPerAttempt: 999,
        };
        expect(
            resolveTextAiExecutionSnapshot(
                historical,
                historical.aggregateBudget,
            ).id,
        ).toBe(defaultModel!.id);
    });
});
