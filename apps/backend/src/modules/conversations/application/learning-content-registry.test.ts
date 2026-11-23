import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ProseKnowledgeBodySchema } from '@languon/contracts';
import {
    compileGeneratedReading,
    generatedReadingSchema,
    learningContentProseText,
} from './learning-content-prose';
import {
    learningContentRegistry,
    learningContentSchemaForBrief,
} from './learning-content-registry';

describe('bounded learning-content capability registry', () => {
    it('binds every advertised kind to schemas, validation, source authority and a compact context policy', () => {
        expect(learningContentRegistry.map(({ kind }) => kind)).toEqual([
            'prose',
            'vocabulary',
            'grammar',
            'bilingual-text',
            'exercises',
        ]);

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

    it('compiles literal reading sections into canonical, source-bindable document nodes', () => {
        const sections = generatedReadingSchema.parse([
            { kind: 'heading', level: 2, text: 'La démocratie' },
            { kind: 'paragraph', text: 'Le débat continue.' },
            { kind: 'bulletList', items: ['Écouter', 'Participer'] },
            { kind: 'orderedList', items: ['Lire', 'Répondre'] },
        ]);
        const body = ProseKnowledgeBodySchema.parse(
            compileGeneratedReading(sections),
        );

        expect(learningContentProseText(body)).toBe(
            'La démocratie\nLe débat continue.\nÉcouter\nParticiper\nLire\nRépondre',
        );

        expect(body.document.content?.map((node) => node.type)).toEqual([
            'heading',
            'paragraph',
            'bulletList',
            'orderedList',
        ]);

        const schema = learningContentSchemaForBrief({
            tasks: [
                {
                    id: 'reading',
                    kind: 'prose',
                    language: 'fr',
                    instruction: 'Create a French reading.',
                },
            ],
        });
        const wire = { tasks: [{ taskId: 'reading', prose: sections }] };
        expect(schema.parse(wire)).toEqual(wire);
        expect(JSON.stringify(z.toJSONSchema(schema))).toContain('"paragraph"');
        expect(
            schema.safeParse({ tasks: [{ taskId: 'reading', prose: body }] })
                .success,
        ).toBe(false);

        expect(
            schema.safeParse({
                tasks: [{ taskId: 'reading', prose: sections, blocks: [] }],
            }).success,
        ).toBe(false);

        expect(
            generatedReadingSchema.safeParse([
                { kind: 'heading', level: 4, text: 'X' },
            ]).success,
        ).toBe(false);

        expect(
            generatedReadingSchema.safeParse([
                { kind: 'paragraph', text: '   ' },
            ]).success,
        ).toBe(false);

        expect(
            generatedReadingSchema.safeParse([
                { kind: 'paragraph', text: 'X', attrs: { block: {} } },
            ]).success,
        ).toBe(false);

        expect(
            generatedReadingSchema.safeParse([
                { kind: 'bulletList', items: [] },
            ]).success,
        ).toBe(false);
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
