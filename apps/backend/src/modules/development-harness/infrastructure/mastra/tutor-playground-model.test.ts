import { describe, expect, it } from 'vitest';
import {
    exerciseActivityCatalog,
    LearningBlockSchema,
} from '@languon/contracts';
import { randomUUID } from 'node:crypto';
import {
    createLearningContentTools,
    createNamedExerciseTools,
    namedExerciseToolDefinition,
} from '../../../conversations/infrastructure/ai/learning-content-tools';
import {
    createPlaygroundModel,
    playgroundBlock,
} from './tutor-playground-model';
import {
    TutorPlaygroundContextSchema,
    TutorPlaygroundTurnInputSchema,
} from './tutor-playground-contract';
import { capturePlaygroundModel } from './tutor-playground-diagnostics';

describe('synthetic tutor playground provider boundary', () => {
    it.each(['vocabulary', 'grammar', 'bilingual-text', 'exercises'] as const)(
        'authors valid %s through the production tool factory',
        async (kind) => {
            const published: unknown[] = [];
            const model = createPlaygroundModel(() => undefined);
            const tools = createLearningContentTools({
                signal: new AbortController().signal,
                authorizedSources:
                    kind === 'exercises'
                        ? playgroundBlock({
                              id: 'seed',
                              kind: 'vocabulary',
                              instruction: 'Synthetic vocabulary source.',
                              language: 'en',
                              translationLanguage: 'es',
                              count: 3,
                          })
                        : [],
                publish: async (proposal) => {
                    published.push(proposal);

                    return { id: randomUUID() };
                },
                generate: async (call) => {
                    const response = await model.doGenerate({
                        prompt: [
                            {
                                role: 'user',
                                content: [{ type: 'text', text: call.prompt }],
                            },
                        ],
                        maxOutputTokens: call.maxOutputTokens,
                    });
                    const content = response.content.find(
                        (item) => item.type === 'text',
                    );

                    if (!content || content.type !== 'text') {
                        throw new Error('Missing synthetic author response.');
                    }

                    return JSON.parse(content.text);
                },
            });
            const id =
                kind === 'bilingual-text'
                    ? 'generate_bilingual_text'
                    : kind === 'exercises'
                      ? 'generate_exercises'
                      : kind === 'grammar'
                        ? 'generate_grammar'
                        : 'generate_vocabulary';
            const tool = tools[id];
            const result = await tool.execute!(
                {
                    instruction: 'Synthetic fixture generation.',
                    language: 'en',
                    ...(kind === 'vocabulary' || kind === 'bilingual-text'
                        ? { translationLanguage: 'es' }
                        : {}),
                    ...(kind === 'exercises' || kind === 'vocabulary'
                        ? { count: 3 }
                        : {}),
                },
                {} as never,
            );

            expect(result).toMatchObject({
                status: 'ready',
                receipt: { requiresLearnerApply: true },
            });

            expect(published).toHaveLength(1);
        },
    );

    it.each(exerciseActivityCatalog)(
        'executes the fixed $id Studio activity through canonical authoring and publication',
        async (activity) => {
            const published: { blocks: unknown[] }[] = [];
            const model = createPlaygroundModel(() => undefined);
            const source =
                activity.category === 'vocabulary'
                    ? playgroundBlock({
                          id: 'seed',
                          kind: 'vocabulary',
                          instruction: 'Synthetic source.',
                          language: 'en',
                          translationLanguage: 'es',
                          count: 1,
                      })
                    : activity.category === 'grammar'
                      ? playgroundBlock({
                            id: 'seed',
                            kind: 'grammar',
                            instruction: 'Synthetic source.',
                            language: 'en',
                        })
                      : playgroundBlock({
                            id: 'seed',
                            kind: 'bilingual-text',
                            instruction: 'Synthetic source.',
                            language: 'en',
                            translationLanguage: 'es',
                            sourceText: 'A river runs beside the garden.',
                        });
            const tools = createNamedExerciseTools({
                signal: new AbortController().signal,
                authorizedSources: source,
                publish: async (proposal) => {
                    published.push(proposal);

                    return { id: randomUUID() };
                },
                generate: async (call) => {
                    const result = await model.doGenerate({
                        prompt: [
                            {
                                role: 'user',
                                content: [{ type: 'text', text: call.prompt }],
                            },
                        ],
                        maxOutputTokens: call.maxOutputTokens,
                    });
                    const content = result.content.find(
                        (item) => item.type === 'text',
                    );

                    if (!content || content.type !== 'text') {
                        throw new Error('Missing fixture response.');
                    }

                    return JSON.parse(content.text);
                },
            });
            const tool = tools[namedExerciseToolDefinition(activity.id).id];
            const result = await tool.execute!(
                namedExerciseToolDefinition(activity.id).inputSchema.parse({
                    language: 'en',
                    explanationLanguage: 'en',
                    count: 1,
                }),
                {} as never,
            );

            expect(result).toMatchObject({
                status: 'ready',
                receipt: { requiresLearnerApply: true },
            });

            expect(published).toHaveLength(1);
            const block = LearningBlockSchema.parse(published[0]!.blocks[0]);
            expect(
                block.type === 'exercise' && block.semantics?.activity.id,
            ).toBe(activity.id);

            expect(
                block.type === 'exercise' && block.semantics?.checking.policy,
            ).toBe(activity.checkingPolicy);
        },
    );

    it('fixture source blocks satisfy canonical schema before source seeding', () => {
        for (const kind of ['grammar', 'vocabulary'] as const) {
            const blocks = playgroundBlock({
                id: 'fixture',
                kind,
                instruction: 'Synthetic fixture.',
                language: 'en',
                translationLanguage: 'es',
                count: 3,
            });

            blocks.forEach((block) =>
                expect(LearningBlockSchema.safeParse(block).success).toBe(true),
            );
        }
    });

    it('rejects caller identity, tools and unknown scenarios', () => {
        expect(
            TutorPlaygroundContextSchema.safeParse({ ownerId: randomUUID() })
                .success,
        ).toBe(false);

        expect(
            TutorPlaygroundTurnInputSchema.safeParse({
                scenarioId: 'foreign-source',
                message: 'Hello',
            }).success,
        ).toBe(false);

        expect(
            TutorPlaygroundTurnInputSchema.safeParse({
                message: 'Hello',
                tools: {},
            }).success,
        ).toBe(false);
    });

    it('captures prompt/result only, omitting SDK config and headers', async () => {
        const model = createPlaygroundModel(() => undefined);
        Object.assign(model, { apiKey: 'SENTINEL_SECRET' });
        const records: unknown[] = [];
        const captured = capturePlaygroundModel(model, records);
        await captured.doGenerate({
            prompt: [
                {
                    role: 'user',
                    content: [{ type: 'text', text: 'Synthetic question' }],
                },
            ],
            headers: { authorization: 'SENTINEL_HEADER' },
        });

        const text = JSON.stringify(records);
        expect(text).toContain('Synthetic question');
        expect(text).not.toContain('SENTINEL');
    });
});
