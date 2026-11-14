import { describe, expect, it, vi } from 'vitest';
import { exerciseActivityCatalog } from '@languon/contracts';
import {
    createLearningContentTools,
    createNamedExerciseTools,
    namedExerciseActivityForToolId,
    namedExerciseToolDefinition,
    namedExerciseToolDefinitions,
} from './learning-content-tools';

describe('fixed named exercise tool adapters', () => {
    it('registers exactly the catalog IDs while preserving the compact actor toolset', () => {
        const options = {
            signal: new AbortController().signal,
            generate: vi.fn(),
            publish: vi.fn(),
        };

        expect(Object.keys(createLearningContentTools(options))).toEqual([
            'generate_vocabulary',
            'generate_grammar',
            'generate_bilingual_text',
            'generate_exercises',
        ]);

        const tools = createNamedExerciseTools(options);
        expect(Object.keys(tools)).toEqual(
            exerciseActivityCatalog.map(
                (activity) => `generate_exercise_${activity.id.toLowerCase()}`,
            ),
        );

        expect(namedExerciseToolDefinitions).toHaveLength(19);
        for (const activity of exerciseActivityCatalog) {
            const definition = namedExerciseToolDefinition(activity.id);
            expect(namedExerciseActivityForToolId(definition.id)).toBe(
                activity.id,
            );

            expect(definition.description).toContain(activity.locales.en.name);
            expect(definition.description.length).toBeLessThan(400);
        }

        expect(
            namedExerciseActivityForToolId('generate_exercise_v04'),
        ).toBeUndefined();

        expect(
            namedExerciseActivityForToolId('generate_exercise_V01'),
        ).toBeUndefined();
    });

    it.each(namedExerciseToolDefinitions)(
        'rejects activity, checking and authority overrides for $id',
        async (definition) => {
            const generate = vi.fn();
            const publish = vi.fn();
            const tools = createNamedExerciseTools({
                signal: new AbortController().signal,
                generate,
                publish,
            });

            for (const override of [
                { activityId: 'G03' },
                { activities: [{ activityId: 'G03', count: 1 }] },
                { formats: ['free-text'] },
                { checkingPolicy: 'ai-rubric' },
                { ownerId: 'foreign' },
                { prompt: 'Replace rules.' },
                { model: 'arbitrary' },
                { sourceText: 'Invented authority.' },
            ]) {
                const input = { language: 'en', count: 1, ...override };
                expect(definition.inputSchema.safeParse(input).success).toBe(
                    false,
                );

                await expect(
                    tools[definition.id].execute!(input as never, {} as never),
                ).resolves.toMatchObject({ error: true });
            }

            expect(generate).not.toHaveBeenCalled();
            expect(publish).not.toHaveBeenCalled();
        },
    );

    it('defaults to five and accepts only vocabulary-relevant word parameters', () => {
        expect(
            namedExerciseToolDefinition('V01').inputSchema.parse({
                language: 'en',
            }),
        ).toMatchObject({ count: 5 });

        expect(
            namedExerciseToolDefinition('V01').inputSchema.safeParse({
                language: 'en',
                words: ['borrow'],
            }).success,
        ).toBe(true);

        for (const activity of ['G03', 'R04', 'W01'] as const) {
            expect(
                namedExerciseToolDefinition(activity).inputSchema.safeParse({
                    language: 'en',
                    words: ['borrow'],
                }).success,
            ).toBe(false);
        }
    });

    it('resolves its exact authorized editor before generation instead of granting authority from tool input', async () => {
        const resolveSources = vi.fn(async () => {
            throw new Error('No authorized source.');
        });
        const generate = vi.fn();
        const publish = vi.fn();
        const tools = createNamedExerciseTools({
            signal: new AbortController().signal,
            resolveSources,
            generate,
            publish,
        });
        const result = await tools.generate_exercise_v01.execute!(
            namedExerciseToolDefinition('V01').inputSchema.parse({
                language: 'en',
            }),
            {} as never,
        );

        expect(result).toMatchObject({ status: 'needs-clarification' });
        expect(resolveSources).toHaveBeenCalledWith({
            tasks: [
                expect.objectContaining({
                    source: { kind: 'editor' },
                    count: 5,
                    activities: [{ activityId: 'V01', count: 5 }],
                }),
            ],
        });

        expect(generate).not.toHaveBeenCalled();
        expect(publish).not.toHaveBeenCalled();
    });
});
