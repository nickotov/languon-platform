import { describe, expect, it } from 'vitest';
import {
    TextAiRoutingConfigurationSchema,
    type TextAiRoutingConfiguration,
} from '@languon/contracts';
import {
    effectiveTextAiRouteIds,
    textAiFlowForFormat,
    validateTextAiRouting,
} from '../../../../src/modules/text-ai/domain/text-ai-routing';
const configuration: TextAiRoutingConfiguration = {
    default: {
        primaryRouteId: 'deepseek/deepseek-flash',
        fallbackRouteIds: [],
    },
    overrides: {},
    enabledRouteIds: ['deepseek/deepseek-flash'],
    flowTariffs: {},
};
describe('admin text routing authority', () => {
    it('supports sparse overrides and missing tariff setup diagnostics', () => {
        expect(TextAiRoutingConfigurationSchema.parse(configuration)).toEqual(
            configuration,
        );
    });
    it('groups versioned formats without accepting unregistered operations', () => {
        expect(textAiFlowForFormat('text-translation:v3')).toBe(
            'text-translation',
        );
        expect(() => textAiFlowForFormat('unknown:v1')).toThrow();
    });
    it('keeps primary order and flow-specific overrides', () => {
        expect(
            effectiveTextAiRouteIds(
                {
                    ...configuration,
                    overrides: {
                        'sentence-check': {
                            primaryRouteId: 'openrouter/openai/gpt-6-luna',
                            fallbackRouteIds: ['deepseek/deepseek-flash'],
                        },
                    },
                },
                'sentence-check',
            ),
        ).toEqual(['openrouter/openai/gpt-6-luna', 'deepseek/deepseek-flash']);
    });
    it('rejects duplicate candidates', () => {
        expect(
            TextAiRoutingConfigurationSchema.safeParse({
                ...configuration,
                default: {
                    primaryRouteId: 'deepseek/deepseek-flash',
                    fallbackRouteIds: ['deepseek/deepseek-flash'],
                },
            }).success,
        ).toBe(false);
    });
    it('rejects retired, unknown, disabled and incompatible routes', () => {
        expect(() =>
            validateTextAiRouting(configuration, [
                {
                    routeId: 'deepseek/deepseek-flash',
                    formats: ['sentence-check:v1'],
                    retired: true,
                },
            ]),
        ).toThrow();
        expect(() => validateTextAiRouting(configuration, [])).toThrow();
        expect(() =>
            validateTextAiRouting(
                {
                    ...configuration,
                    default: {
                        primaryRouteId: 'openrouter/openai/gpt-6-luna',
                        fallbackRouteIds: [],
                    },
                },
                [
                    {
                        routeId: 'deepseek/deepseek-flash',
                        formats: ['sentence-check:v1'],
                    },
                ],
            ),
        ).toThrow();
    });
});
