import { generationPlanCapacity } from '../../application/learning-content-plan-capacity';
import { namedExerciseFixture } from '../../../../../tests/support/named-exercise-fixture';
import { bodyBlocks } from './learning-generation-plan';
import { GenerationPlanSchema } from '@languon/contracts';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createLearningContentAuthoring } from './learning-content-authoring';
import { TutorStructuredOutputError } from './tutor-request-agents';
import {
    createGenerationPlan,
    restoreGenerationExecution,
    resultBody,
    generationHash,
} from './learning-generation-plan';
import { normalizeLearningContentDefaults } from '../../application/learning-content-presentation';
import { planLearningContentBatches } from '../../application/learning-content-batches';
import type { LearningContentBrief } from '../../application/learning-content-contract';
import type { GenerationArtifact } from '../../application/ports/generation-run';

const prose = {
    schemaVersion: 2 as const,
    document: {
        type: 'doc' as const,
        content: [
            {
                type: 'paragraph' as const,
                content: [
                    {
                        type: 'text' as const,
                        text: 'Les habitants participent au débat public.',
                    },
                ],
            },
        ],
    },
};
const grammar = {
    id: randomUUID(),
    type: 'grammar' as const,
    language: 'fr',
    rule: 'Le COD devient sujet à la voix passive.',
};
const brief: LearningContentBrief = {
    tasks: [
        {
            id: 'reading',
            kind: 'prose',
            instruction: 'A French-only reading.',
            language: 'fr',
        },
        {
            id: 'grammar',
            kind: 'grammar',
            instruction: 'Explain COD and COI, including passive voice.',
            language: 'fr',
            explanationLanguage: 'fr',
        },
    ],
    outputOrder: ['grammar', 'reading'],
};
const response = (taskId: string) => ({
    tasks: [
        taskId === 'reading'
            ? { taskId, blocks: [], prose }
            : { taskId, blocks: [grammar] },
    ],
});

describe('resumable generation executor', () => {
    it.each([
        ['selection', 'prose'],
        ['provided-text', 'prose'],
        ['proposal', 'prose'],
        ['selection', 'grammar'],
        ['provided-text', 'grammar'],
        ['proposal', 'grammar'],
    ] as const)(
        'restores exact %s evidence for a transcript-free %s task, including refreshed snapshots',
        async (sourceKind, taskKind) => {
            const text =
                'Les citoyens examinent la nouvelle proposition municipale.';
            const sourceId = 'source-reading';
            const materialId = randomUUID();
            const proposalId = randomUUID();
            const block = {
                id: randomUUID(),
                type: 'bilingual-text' as const,
                language: 'fr',
                translations: [],
                segments: [{ id: randomUUID(), text }],
            };
            const reference =
                sourceKind === 'selection'
                    ? { kind: 'selection' as const }
                    : sourceKind === 'provided-text'
                      ? { kind: 'provided-text' as const, materialId }
                      : {
                            kind: 'proposal' as const,
                            proposalId,
                            blockId: block.id,
                        };
            const task = {
                id: taskKind === 'prose' ? 'reading' : 'grammar',
                kind: taskKind,
                language: 'fr',
                instruction: 'Explain the captured material.',
                inputs: [{ kind: 'source', sourceId }],
                sourceText: 'STALE MATERIAL BEFORE REFRESH',
                ...(taskKind === 'grammar'
                    ? { explanationLanguage: 'fr' }
                    : {}),
            };
            const plan = GenerationPlanSchema.parse({
                schemaVersion: 1,
                replyLanguage: 'en',
                tasks: [task],
                sources: [{ id: sourceId, kind: 'text', reference }],
                outputOrder: [task.id],
            });
            const snapshot =
                sourceKind === 'selection'
                    ? {
                          sourceId,
                          blocks: [],
                          selection: {
                              noteId: randomUUID(),
                              noteVersion: 2,
                              text,
                          },
                      }
                    : sourceKind === 'provided-text'
                      ? {
                            sourceId,
                            blocks: [],
                            providedText: { materialId, text },
                        }
                      : { sourceId, blocks: [block], proposalId };
            const restored = restoreGenerationExecution({
                runId: randomUUID(),
                revision: 2,
                plan,
                sources: [snapshot],
                artifacts: [],
                purpose: 'generation',
            });

            expect(restored.brief.tasks[0]!.sourceText).toBeUndefined();
            const generate = vi.fn().mockResolvedValue(response(task.id));
            const result = await createLearningContentAuthoring({
                ...restored,
                generate,
            }).generate(restored.brief, new AbortController().signal);

            expect(result.status).toBe('ready');
            expect(generate.mock.calls[0]![0].prompt).toContain(text);
            expect(generate.mock.calls[0]![0].prompt).not.toContain(
                'STALE MATERIAL BEFORE REFRESH',
            );

            if (sourceKind === 'proposal') {
                expect(generate.mock.calls[0]![0].prompt).toContain(block.id);
            }
        },
    );

    it('binds captured local-block evidence to the run snapshot rather than a mutable live block', async () => {
        const runId = randomUUID();
        const sourceId = 'captured-rule';
        const plan = GenerationPlanSchema.parse({
            schemaVersion: 1,
            replyLanguage: 'en',
            sources: [
                {
                    id: sourceId,
                    kind: 'grammar',
                    reference: { kind: 'block', blockId: grammar.id },
                },
            ],
            tasks: [
                {
                    id: 'practice',
                    kind: 'exercises',
                    instruction: 'Practice the captured rule.',
                    language: 'fr',
                    explanationLanguage: 'fr',
                    inputs: [{ kind: 'source', sourceId }],
                    activities: [{ activityId: 'G02', count: 1 }],
                },
            ],
            outputOrder: ['practice'],
        });
        const restored = restoreGenerationExecution({
            runId,
            revision: 2,
            plan,
            sources: [{ sourceId, blocks: [grammar] }],
            artifacts: [],
            purpose: 'generation',
        });
        const exercise = namedExerciseFixture({
            activityId: 'G02',
            sources: [grammar],
            language: 'fr',
            explanationLanguage: 'fr',
        });
        const result = await createLearningContentAuthoring({
            ...restored,
            generate: vi.fn().mockResolvedValue({
                tasks: [{ taskId: 'practice', blocks: [exercise] }],
            }),
        }).generate(restored.brief, new AbortController().signal);

        expect(result.status).toBe('ready');
        if (result.status !== 'ready') {
            return;
        }

        const output = bodyBlocks(result.proposal.body)[0]!;
        expect(output.type === 'exercise' && output.semantics?.sources).toEqual(
            [
                {
                    kind: 'grammar',
                    rule: grammar.rule,
                    origin: {
                        kind: 'captured-block',
                        runId,
                        revision: 2,
                        sourceId,
                        blockId: grammar.id,
                        contentHash: generationHash(grammar),
                    },
                },
            ],
        );
    });

    it('quotes the next vocabulary fragment using the executor checkpoint key', async () => {
        const plan = GenerationPlanSchema.parse({
            schemaVersion: 1,
            replyLanguage: 'en',
            sources: [],
            tasks: [
                {
                    id: 'words',
                    kind: 'vocabulary',
                    instruction: 'Create travel vocabulary.',
                    language: 'fr',
                    translationLanguage: 'en',
                    count: 50,
                    inputs: [],
                },
            ],
            outputOrder: ['words'],
        });
        const restored = restoreGenerationExecution({
            runId: randomUUID(),
            revision: 1,
            plan,
            sources: [],
            artifacts: [],
            purpose: 'generation',
        });
        const keys: string[] = [];
        let calls = 0;
        const result = await createLearningContentAuthoring({
            ...restored,
            readBudget: () => ({
                remainingCalls: 1 - calls,
                remainingOutputTokens: 10000,
            }),
            onValidatedBatch: async ({ batchKey }) => {
                keys.push(batchKey);
            },
            generate: async () => {
                calls += 1;

                return {
                    tasks: [
                        {
                            taskId: 'words',
                            blocks: [
                                {
                                    id: randomUUID(),
                                    type: 'vocabulary',
                                    language: 'fr',
                                    translationLanguage: 'en',
                                    entries: Array.from(
                                        { length: 31 },
                                        (_, index) => ({
                                            id: randomUUID(),
                                            term: `terme${index}`,
                                            translation: `term${index}`,
                                        }),
                                    ),
                                },
                            ],
                        },
                    ],
                };
            },
        }).generate(restored.brief, new AbortController().signal);

        expect(result.status).toBe('paused');
        expect(keys).toHaveLength(1);
        expect(generationPlanCapacity(plan, [], keys)).toEqual({
            status: 'ready',
            minimumOutputTokens: 2740,
        });
    });

    it('checkpoints one accepted unit, pauses successfully and resumes without regenerating it', async () => {
        const executable = createGenerationPlan(brief, new Map(), 'en');
        const artifacts: GenerationArtifact[] = [];
        const run = { runId: randomUUID(), revision: 1 };
        let calls = 0;
        const first = await createLearningContentAuthoring({
            run,
            readBudget: () => ({
                remainingCalls: 1 - calls,
                remainingOutputTokens: 5000,
            }),
            generate: async () => {
                calls += 1;

                return response('reading');
            },
            onValidatedBatch: async ({
                results,
                batchKey,
                artifactIds,
                taskComplete,
            }) => {
                for (const result of results) {
                    artifacts.push({
                        id: artifactIds.get(result.taskId)!,
                        revision: run.revision,
                        taskId: result.taskId,
                        batchKey,
                        taskComplete,
                        body: resultBody(result),
                        contentHash: generationHash(resultBody(result)),
                        requirementsHash: 'a'.repeat(64),
                        sourceHash: 'b'.repeat(64),
                        validationVersion: 'learning-content-v1',
                    });
                }
            },
        }).generate(brief, new AbortController().signal);

        expect(first.status).toBe('paused');
        expect(artifacts).toHaveLength(1);
        const restored = restoreGenerationExecution({
            ...run,
            ...executable,
            artifacts,
            purpose: 'generation',
        });
        const generate = vi.fn().mockResolvedValue(response('grammar'));
        const second = await createLearningContentAuthoring({
            ...restored,
            run,
            generate,
        }).generate(restored.brief, new AbortController().signal);

        expect(second.status).toBe('ready');
        expect(generate).toHaveBeenCalledOnce();
        if (second.status === 'ready') {
            expect(
                second.proposal.body.document.content!.map((node) => node.type),
            ).toEqual(['learningBlock', 'paragraph']);
        }
    });

    it('reuses complete artifacts across presentation-only revisions and preserves producing provenance', async () => {
        const executable = createGenerationPlan(
            { tasks: [brief.tasks[0]!] },
            new Map(),
            'en',
        );
        const artifact: GenerationArtifact = {
            id: randomUUID(),
            revision: 1,
            taskId: 'reading',
            batchKey: 'prior-batch-key',
            taskComplete: true,
            body: prose,
            contentHash: generationHash(prose),
            requirementsHash: 'a'.repeat(64),
            sourceHash: 'b'.repeat(64),
            validationVersion: 'learning-content-v1',
        };
        const restored = restoreGenerationExecution({
            runId: randomUUID(),
            revision: 2,
            ...executable,
            artifacts: [artifact],
            purpose: 'generation',
        });

        expect(restored.completed[0]!.generatedOrigin?.revision).toBe(1);
        const generate = vi.fn();
        const result = await createLearningContentAuthoring({
            ...restored,
            generate,
            readBudget: () => ({ remainingCalls: 0, remainingOutputTokens: 0 }),
        }).generate(restored.brief, new AbortController().signal);

        expect(result.status).toBe('ready');
        expect(generate).not.toHaveBeenCalled();
    });

    it('grounds exercises in the exact generated prose artifact without inventing a note selection', async () => {
        const run = { runId: randomUUID(), revision: 1 };
        const material = {
            id: randomUUID(),
            type: 'bilingual-text' as const,
            language: 'fr',
            translations: [],
            segments: [
                {
                    id: randomUUID(),
                    text: 'Les habitants participent au débat public.',
                },
            ],
        };
        const exercise = {
            ...namedExerciseFixture({
                activityId: 'R04',
                sources: [material],
                language: 'fr',
                explanationLanguage: 'fr',
            }),
            sourceBindings: [{ kind: 'text-selection' }],
        };
        const generate = vi
            .fn()
            .mockResolvedValueOnce(response('reading'))
            .mockResolvedValueOnce({
                tasks: [{ taskId: 'practice', blocks: [exercise] }],
            });
        const checkpoints: string[] = [];
        const result = await createLearningContentAuthoring({
            run,
            generate,
            onValidatedBatch: async ({ artifactIds }) => {
                checkpoints.push(...artifactIds.values());
            },
        }).generate(
            {
                tasks: [
                    brief.tasks[0]!,
                    {
                        id: 'practice',
                        kind: 'exercises',
                        instruction: 'Check the reading.',
                        language: 'fr',
                        explanationLanguage: 'fr',
                        count: 1,
                        activities: [{ activityId: 'R04', count: 1 }],
                        source: { kind: 'task', taskId: 'reading' },
                    },
                ],
            },
            new AbortController().signal,
        );

        expect(result.status).toBe('ready');
        if (result.status !== 'ready') {
            return;
        }

        const block = bodyBlocks(result.proposal.body)[0]!;
        expect(block.type === 'exercise' && block.semantics?.sources).toEqual([
            {
                kind: 'generated-text',
                origin: {
                    kind: 'generated-artifact',
                    ...run,
                    taskId: 'reading',
                    artifactId: checkpoints[0],
                    contentHash: generationHash(prose),
                },
                text: 'Les habitants participent au débat public.',
            },
        ]);

        expect(generate.mock.calls[1]![0].prompt).toContain(
            'Les habitants participent au débat public.',
        );
    });

    it('repairs a completed length error once and passes its exact receipt to the checkpoint', async () => {
        const events: string[] = [];
        const generate = vi
            .fn()
            .mockRejectedValueOnce(
                new TutorStructuredOutputError('output-limit'),
            )
            .mockResolvedValue(response('reading'));
        const result = await createLearningContentAuthoring({
            generate,
            trackValidatedCalls: true,
            readBudget: () => ({
                remainingCalls: 4,
                remainingOutputTokens: 10000,
            }),
            onCallRejected: async () => {
                events.push('rejected');
            },
            onValidatedBatch: async () => {
                events.push('checkpoint');
            },
        }).generate({ tasks: [brief.tasks[0]!] }, new AbortController().signal);

        expect(result.status).toBe('ready');
        expect(events).toEqual(['rejected', 'checkpoint']);
        expect(
            result.status === 'ready' && result.validatedCallIds,
        ).toHaveLength(1);

        expect(generate).toHaveBeenCalledTimes(2);
    });

    it('does not redispatch an ambiguous transport failure or a failed checkpoint', async () => {
        for (const checkpointFailure of [false, true]) {
            const generate = vi.fn().mockImplementation(async () => {
                if (!checkpointFailure) {
                    throw new Error('connection lost');
                }

                return response('reading');
            });

            await expect(
                createLearningContentAuthoring({
                    generate,
                    onValidatedBatch: async () => {
                        throw new Error('lease lost');
                    },
                }).generate(
                    { tasks: [brief.tasks[0]!] },
                    new AbortController().signal,
                ),
            ).rejects.toThrow(
                checkpointFailure ? 'lease lost' : 'connection lost',
            );

            expect(generate).toHaveBeenCalledOnce();
        }
    });

    it('retains upper bounds and plans homogeneous dependency units across action limits', () => {
        const normalized = normalizeLearningContentDefaults({
            tasks: [
                {
                    id: 'practice',
                    kind: 'exercises',
                    instruction: 'Up to three questions.',
                    language: 'fr',
                    maxCount: 3,
                },
            ],
        });

        expect(normalized.brief.tasks[0]!.count).toBe(3);
        const plan = planLearningContentBatches({
            tasks: [
                {
                    id: 'reading',
                    kind: 'bilingual-text',
                    instruction: 'Read about civic life.',
                    language: 'fr',
                    translationLanguage: 'ru',
                },
                {
                    id: 'reading-practice',
                    kind: 'exercises',
                    instruction: 'Three different comprehension questions.',
                    language: 'fr',
                    source: { kind: 'task', taskId: 'reading' },
                    count: 3,
                    activities: [
                        { activityId: 'R01', count: 1 },
                        { activityId: 'R04', count: 1 },
                        { activityId: 'R08', count: 1 },
                    ],
                },
                brief.tasks[1]!,
                {
                    id: 'grammar-practice',
                    kind: 'exercises',
                    instruction: 'Four grammar questions.',
                    language: 'fr',
                    source: { kind: 'task', taskId: 'grammar' },
                    count: 4,
                    activities: [{ activityId: 'G02', count: 4 }],
                },
            ],
        });

        expect(plan).not.toBeNull();
        expect(
            plan!.batches.every(
                (batch) =>
                    new Set(batch.brief.tasks.map((task) => task.kind)).size ===
                    1,
            ),
        ).toBe(true);

        expect(plan!.batches.length).toBeGreaterThanOrEqual(4);
    });
});
