import { describe, expect, it, vi } from 'vitest';
import { createTextAiSyntheticFlows } from '../../../../../src/infrastructure/text-ai/probe-flow-registry';
import { createMastraCardProposalGenerator } from '../../../../../src/modules/dictionaries/infrastructure/ai/card-proposal-generators';
import { createMastraCardAuthoringProposalGenerator } from '../../../../../src/modules/dictionaries/infrastructure/ai/card-authoring-proposal-generators';
import { createMastraImportPairsProposalGenerator } from '../../../../../src/modules/dictionaries/infrastructure/ai/import-pairs-proposal-generators';
import { createMastraPastedTermsProposalGenerator } from '../../../../../src/modules/dictionaries/infrastructure/ai/pasted-terms-proposal-generators';
import { textAiModelCatalog } from '../../../../../src/modules/text-ai/application/text-ai-provider-catalog';

const factories = [
    { flow: 'single-card', create: createMastraCardProposalGenerator },
    {
        flow: 'card-authoring',
        create: createMastraCardAuthoringProposalGenerator,
    },
    { flow: 'import-pairs', create: createMastraImportPairsProposalGenerator },
    { flow: 'pasted-terms', create: createMastraPastedTermsProposalGenerator },
] as const;
const model = textAiModelCatalog.find(
    (model) => model.providerId === 'openrouter',
)!;
const snapshot = {
    ...model,
    modelId: model.id,
    enabledModelIds: [model.id],
    supportedFormats: [...model.supportedFormats],
};

describe.each(factories)(
    '$flow provider execution evidence',
    ({ flow, create }) => {
        it.each([
            [429, 'rejected'],
            [403, 'ambiguous'],
            [503, 'ambiguous'],
        ] as const)(
            'preserves SDK HTTP %s execution outcome',
            async (statusCode, executionOutcome) => {
                const generator = create({
                    agent: {
                        generate: vi
                            .fn()
                            .mockRejectedValue(
                                Object.assign(
                                    new Error('Synthetic provider failure.'),
                                    { statusCode },
                                ),
                            ),
                    },
                });
                await expect(
                    generator.generate({
                        input: JSON.parse(
                            createTextAiSyntheticFlows()[flow].input,
                        ) as never,
                        providerBudget: model.aggregateBudget,
                        providerExecution: snapshot,
                        idempotencyKey: 'synthetic-provider-rejection',
                        signal: new AbortController().signal,
                    }),
                ).rejects.toMatchObject({ executionOutcome });
            },
        );
        it('marks invalid returned JSON as completed while preserving zero charge semantics', async () => {
            const generator = create({
                agent: {
                    generate: vi.fn().mockResolvedValue({
                        object: {},
                        usage: { inputTokens: 10, outputTokens: 1 },
                    }),
                },
            });
            await expect(
                generator.generate({
                    input: JSON.parse(
                        createTextAiSyntheticFlows()[flow].input,
                    ) as never,
                    providerBudget: model.aggregateBudget,
                    providerExecution: snapshot,
                    idempotencyKey: 'synthetic-invalid-output',
                    signal: new AbortController().signal,
                }),
            ).rejects.toMatchObject({
                executionOutcome: 'completed',
                category: 'invalid_model_output',
            });
        });
    },
);
