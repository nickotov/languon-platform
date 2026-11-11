import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
    learningContentRegistry,
    learningContentSchemaForBrief,
} from './learning-content-registry';

describe('bounded learning-content capability registry', () => {
    it('binds every advertised kind to schemas, validation, source authority and a compact context policy', () => {
        expect(learningContentRegistry).toHaveLength(4);
        for (const capability of learningContentRegistry) {
            expect(capability.inputSchema).toBeInstanceOf(z.ZodType);
            expect(capability.outputSchema).toBeInstanceOf(z.ZodType);
            expect(capability.validate).toBeTypeOf('function');
            expect(capability.authority).toBe('owned-knowledge-proposal');
            expect(capability.contextPolicy).toBe(
                'canonical-artifact-with-compact-receipt',
            );
        }
    });

    it('excludes unrelated block families from a vocabulary authoring schema', () => {
        const schema = learningContentSchemaForBrief({
            tasks: [
                {
                    id: 'words',
                    kind: 'vocabulary',
                    language: 'fr',
                    translationLanguage: 'ru',
                    instruction: 'Prepare ten shopping words.',
                },
            ],
        });
        const serialized = JSON.stringify(z.toJSONSchema(schema));

        expect(serialized).toContain('pronunciation');
        expect(serialized).not.toContain('referenceAnswer');
        expect(serialized).not.toContain('formation');
    });
});
