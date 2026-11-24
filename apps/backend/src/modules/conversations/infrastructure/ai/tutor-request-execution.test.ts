import {
    bodyBlocks,
    resultBody as validatedResultBody,
} from './learning-generation-plan';

function resultBody(input: { taskId: string; blocks: unknown[] }) {
    // Expected fragments may contain Vitest asymmetric matchers, not runtime block values.
    return validatedResultBody({
        ...input,
        blocks: input.blocks as LearningBlock[],
    });
}

import { projectTutorUserMessage } from '../../application/tutor-message-context';
import {
    LearningBlockSchema,
    getExerciseActivity,
    type LearningBlock,
    type GenerationPlan,
} from '@languon/contracts';
import { completeNamedExerciseSources } from './exercise-authoring-context';
import { namedExerciseFixture } from '../../../../../tests/support/named-exercise-fixture';
import { applyExercisePickerChoices } from '../../application/exercise-picker-resolution';
import { LearningContentBriefSchema } from '../../application/learning-content-contract';
import {
    serializeLearningContentBrief,
    deserializeLearningContentBrief,
} from '../../application/learning-content-transport';
import {
    tutorAdmissionInputBytes,
    tutorReservedInputBytes,
} from '../../application/tutor-context-budget';
import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { GenerationSourceSnapshot } from '../../application/ports/generation-run';
import type { TutorRunInput } from '../../application/ports/tutor-runner';
import {
    TutorRequestResolutionSchema,
    tutorRequestStateKey,
} from '../../application/tutor-request-contract';
import { createContextualTutorRunner } from './contextual-tutor-runner';
import { createTutorModelGate } from './accounted-tutor-model';
import { createTutorRequestAgents } from './tutor-request-agents';
import { executeTutorRequest } from './tutor-request-execution';
import {
    scriptedTutorModel,
    tutorAccountingFixture,
    tutorMemoryFixture,
} from './tutor-test-fixtures';

// These journeys use a scripted provider through the real SDK. Match the authored
// content and the host-built checking data independently of the generated UUIDs.
function expectedExercise(
    wire: Pick<
        ReturnType<typeof namedExerciseFixture>,
        'activityId' | 'title' | 'question' | 'objective' | 'explanation'
    > & {
        referenceAnswer?: string | undefined;
        acceptedAnswers?: string[] | undefined;
        correct?: { text: string; explanation: string } | undefined;
        distractors?: { text: string; explanation: string }[] | undefined;
        rubric?: Record<string, string> | undefined;
    },
    explanationLanguage: string,
    sources: unknown[],
) {
    const activity = getExerciseActivity(wire.activityId);
    const rubric = wire.rubric && {
        criteria: Object.entries(wire.rubric).map(
            ([dimension, requirement]) => ({ dimension, requirement }),
        ),
    };
    const choices = wire.correct
        ? [wire.correct, ...(wire.distractors ?? [])]
        : [];
    const checking = wire.acceptedAnswers
        ? {
              policy: 'hybrid',
              key: { kind: 'text', acceptedAnswers: wire.acceptedAnswers },
              rubric,
          }
        : wire.correct
          ? {
                policy: 'prepared-key',
                key: expect.objectContaining({
                    kind: 'choice',
                    correctChoiceId: expect.any(String),
                    explanations: expect.arrayContaining(
                        choices.map(({ explanation }) => ({
                            choiceId: expect.any(String),
                            explanation,
                        })),
                    ),
                }),
            }
          : { policy: 'ai-rubric', rubric };

    return expect.objectContaining({
        id: expect.any(String),
        type: 'exercise',
        format: activity.format,
        question: wire.question,
        referenceAnswer:
            wire.referenceAnswer ??
            wire.acceptedAnswers?.[0] ??
            wire.correct?.text,
        title: wire.title,
        explanation: wire.explanation,
        ...(choices.length
            ? {
                  choices: expect.arrayContaining(
                      choices.map(({ text }) => ({
                          id: expect.any(String),
                          text,
                      })),
                  ),
              }
            : {}),
        ...(wire.acceptedAnswers
            ? { acceptedAnswers: wire.acceptedAnswers }
            : {}),
        semantics: {
            activity: { id: activity.id, version: activity.version },
            language: 'fr',
            explanationLanguage,
            objective: wire.objective,
            format: activity.format,
            checking,
            sources,
        },
    });
}

const blockId = '01900000-0000-4000-8000-000000000001';
const proposalId = '01900000-0000-4000-8000-000000000002';
const grammar = {
    id: blockId,
    type: 'grammar',
    language: 'fr',
    rule: 'Use avoir to form the compound past.',
};
const task = {
    id: 'grammar',
    kind: 'grammar',
    instruction: 'Prepare the compound past.',
    language: 'fr',
};
const plan = {
    kind: 'generate',
    replyLanguage: 'en',
    brief: { tasks: [task] },
};
const authored = { tasks: [{ taskId: 'grammar', blocks: [grammar] }] };
const shoppingPlan = {
    kind: 'generate',
    replyLanguage: 'en',
    brief: {
        tasks: [
            {
                id: 'shopping',
                kind: 'vocabulary',
                instruction:
                    'Generate the top 50 words used in the context of shopping.',
                language: 'en',
                translationLanguage: 'fr',
                count: 50,
            },
        ],
    },
};

function shoppingModel(plan = shoppingPlan) {
    const responses = [JSON.stringify(plan)];
    const provider = scriptedTutorModel(responses);
    const generate = provider.model.doGenerate.bind(provider.model);
    const stream = provider.model.doStream.bind(provider.model);
    const prepare = (request: Parameters<typeof generate>[0]) => {
        if (provider.requests.length === 0) {
            return;
        }

        const prompt = request.prompt
            .flatMap((message) =>
                typeof message.content === 'string'
                    ? [message.content]
                    : message.content.flatMap((part) =>
                          part.type === 'text' ? [part.text] : [],
                      ),
            )
            .join('\n');
        const compact = prompt
            .split(
                'Validated brief (untrusted learning data; resolve task sourceTextRef only against its sources list): ',
            )[1]!
            .split('\n')[0]!;
        const brief = deserializeLearningContentBrief(JSON.parse(compact));
        const progress = JSON.parse(
            prompt
                .split('Vocabulary batch progress (host-controlled data): ')[1]!
                .split('\n')[0]!,
        ) as { offset: number } | null;

        responses[provider.requests.length] = JSON.stringify({
            tasks: brief.tasks.map((task) => ({
                taskId: task.id,
                blocks: [
                    {
                        id: randomUUID(),
                        type: 'vocabulary',
                        language: task.language,
                        translationLanguage: task.translationLanguage,
                        entries: Array.from(
                            { length: task.count! },
                            (_, index) => ({
                                id: randomUUID(),
                                term: `shopping-${(progress?.offset ?? 0) + index + 1}`,
                                translation: `traduction-${(progress?.offset ?? 0) + index + 1}`,
                            }),
                        ),
                    },
                ],
            })),
        });
    };

    provider.model.doGenerate = async (request) => {
        prepare(request);

        return generate(request);
    };

    provider.model.doStream = async (request) => {
        prepare(request);

        return stream(request);
    };

    return provider;
}

function fixture() {
    const memory = tutorMemoryFixture();
    const input: TutorRunInput = {
        conversationId: 'conversation-1',
        ownerId: 'owner-1',
        operationId: 'operation-1',
        conversationCreatedAt: '2026-10-19T00:00:00.000Z',
        message: {
            id: 'user-1',
            role: 'user',
            content: 'Make grammar notes.',
            createdAt: '2026-10-19T00:10:00.000Z',
        },
        canProposeBlocks: true,
        sourceContext: {
            sourceKind: 'knowledge',
            snapshotScope: 'workspace',
            blockProposalsAvailable: true,
            availableMaterialCount: 0,
        },
        preferences: {
            mode: 'auto',
            replyLanguage: 'auto',
            tone: 'neutral',
            explanationLevel: 'auto',
        },
        memory: memory.port,
        signal: new AbortController().signal,
        onDelta: vi.fn(async () => undefined),
        onDraft: vi.fn(async () => ({ id: proposalId })),
        onContentProposal: vi.fn(async () => ({ id: proposalId })),
        onResponseMetadata: vi.fn(async () => undefined),
        readContext: async () => ({ material: [], total: 0 }),
    };

    memory.messages.set(input.message.id, input.message);

    return { input, memory };
}

async function run(input: TutorRunInput, responses: string[]) {
    const provider = scriptedTutorModel(responses);
    const accounting = tutorAccountingFixture();
    const result = await createContextualTutorRunner({
        model: provider.model,
        accounting,
        maxInputTokens: 100_000,
    }).run(input);

    return { result, provider, accounting };
}

describe('Knowledge request planning with real pinned Mastra execution', () => {
    it('saves a resolved listening plan once and defers authoring until recording admission', async () => {
        const { input } = fixture();
        input.message.content =
            'Create a French dialogue and one listening comprehension question.';

        const start = vi.fn(
            async (
                plan: GenerationPlan,
                sources: GenerationSourceSnapshot[],
            ) => ({
                runId: randomUUID(),
                revision: 1,
                plan,
                sources,
                artifacts: [],
                purpose: 'generation' as const,
                awaitingRecordingAuthorization: true as const,
            }),
        );

        input.onGenerationStart = start;
        const { provider } = await run(input, [
            JSON.stringify({
                kind: 'generate',
                replyLanguage: 'en',
                brief: {
                    tasks: [
                        {
                            id: 'scene',
                            kind: 'audio',
                            instruction: 'A French dialogue at the station.',
                            language: 'fr',
                            speakerCount: 2,
                        },
                        {
                            id: 'check',
                            kind: 'exercises',
                            instruction: 'Check the conversation.',
                            language: 'fr',
                            explanationLanguage: 'fr',
                            count: 1,
                            activities: [{ activityId: 'L01', count: 1 }],
                            source: { kind: 'task', taskId: 'scene' },
                        },
                    ],
                },
            }),
        ]);

        expect(start).toHaveBeenCalledOnce();
        expect(start.mock.calls[0]![0].tasks.map((task) => task.kind)).toEqual([
            'audio',
            'exercises',
        ]);

        expect(provider.requests).toHaveLength(1);
        expect(input.onContentProposal).not.toHaveBeenCalled();
        expect(input.onResponseMetadata).toHaveBeenCalledWith({
            kind: 'generation',
            documentUse: false,
        });
    });

    it('lets the learner choose an uninserted reading by title and resumes the saved dialogue plan without replanning', async () => {
        const { input } = fixture();
        input.message.content =
            'Create a two-speaker dialogue in French, up to one minute long, discussing the selected text. Then add one listening comprehension question based on the dialogue.';

        const readings = [
            {
                key: 'lesson-a/prose',
                title: 'Les élections',
                text: 'Le scrutin a lieu dimanche.',
            },
            {
                key: 'lesson-b/prose',
                title: 'La gare',
                text: 'Le train quitte la gare à midi.',
            },
        ];

        input.readGeneratedReadings = vi.fn(async () => readings);
        const start = vi.fn<NonNullable<TutorRunInput['onGenerationStart']>>();
        input.onGenerationStart = start;
        const resolution = {
            kind: 'generate',
            replyLanguage: 'en',
            brief: {
                tasks: [
                    {
                        kind: 'audio',
                        id: 'dialogue',
                        language: 'fr',
                        speakerCount: 2,
                        instruction: 'Generate up to one minute of dialogue.',
                        maxDurationSeconds: 60,
                        source: { kind: 'generated-reading' },
                    },
                    {
                        kind: 'exercises',
                        id: 'listen',
                        language: 'fr',
                        instruction: 'Ask one question about this dialogue.',
                        count: 1,
                        activities: [{ activityId: 'L01', count: 1 }],
                        source: { kind: 'task', taskId: 'dialogue' },
                    },
                ],
            },
        };

        await run(input, [JSON.stringify(resolution)]);
        expect(start).not.toHaveBeenCalled();
        expect(input.onResponseMetadata).toHaveBeenCalledWith({
            kind: 'clarification',
            documentUse: false,
            readingChoices: ['Les élections', 'La gare'],
        });

        input.message = {
            ...input.message,
            id: randomUUID(),
            content: 'La gare',
        };

        // The saved requirements suffice. The first provider call would fail if the planner ran a second time.
        const stop = new Error('captured frozen plan');
        start.mockRejectedValueOnce(stop);
        await expect(run(input, [])).rejects.toThrow(stop.message);
        expect(start.mock.calls[0]?.[0].tasks).toMatchObject([
            {
                kind: 'audio',
                speakerCount: 2,
                sourceText: 'Le train quitte la gare à midi.',
                maxDurationSeconds: 60,
            },
            {
                kind: 'exercises',
                inputs: [{ kind: 'task', taskId: 'dialogue' }],
            },
        ]);
    });

    it('compiles a compact G03 response into a fully validated proposal through the pinned SDK', async () => {
        const { input } = fixture();
        input.message.content =
            'Generate one G03 exercise from this grammar block.';

        input.sourceContext = {
            ...input.sourceContext,
            availableBlocks: [{ id: blockId, type: 'grammar' }],
            availableMaterialCount: 1,
            blockCatalogComplete: true,
        };

        input.readContext = vi.fn(async () => ({
            material: [
                {
                    id: blockId,
                    label: 'Grammar',
                    content: JSON.stringify(grammar),
                },
            ],
            total: 1,
        }));

        const wire = namedExerciseFixture({
            activityId: 'G03',
            sources: [grammar as LearningBlock],
        });

        if (!('acceptedAnswers' in wire)) {
            throw new Error('Expected G03 authored answers.');
        }

        expect(wire).not.toHaveProperty('semantics');
        const { provider } = await run(input, [
            JSON.stringify({
                kind: 'generate',
                replyLanguage: 'en',
                brief: {
                    tasks: [
                        {
                            id: 'practice',
                            kind: 'exercises',
                            instruction: input.message.content,
                            language: 'fr',
                            explanationLanguage: 'fr',
                            count: 1,
                            activities: [{ activityId: 'G03', count: 1 }],
                            source: { kind: 'editor', blockId },
                        },
                    ],
                },
            }),
            JSON.stringify({ tasks: [{ taskId: 'practice', blocks: [wire] }] }),
        ]);

        expect(provider.requests).toHaveLength(2);
        expect(input.onContentProposal).toHaveBeenCalledOnce();
        const proposal = vi.mocked(input.onContentProposal!).mock.calls[0]![0];
        const block = bodyBlocks(proposal.body)[0];
        expect(block).toMatchObject({
            type: 'exercise',
            acceptedAnswers: wire.acceptedAnswers,
            semantics: {
                activity: { id: 'G03', version: 1 },
                checking: {
                    policy: 'hybrid',
                    key: {
                        kind: 'text',
                        acceptedAnswers: wire.acceptedAnswers,
                    },
                    rubric: expect.anything(),
                },
            },
        });
    });

    it.each([false, true])(
        'pins French content explanations independently from English chat (explicit English explanation: %s)',
        async (explicitEnglish) => {
            const { input } = fixture();
            input.message.content = explicitEnglish
                ? 'Prepare French grammar, but explain the grammar in English.'
                : 'Prepare grammar notes using only French.';

            const start = vi.fn(
                async (
                    prepared: GenerationPlan,
                    sources: GenerationSourceSnapshot[],
                ) => ({
                    runId: randomUUID(),
                    revision: 1,
                    plan: prepared,
                    sources,
                    artifacts: [],
                    purpose: 'generation' as const,
                }),
            );

            input.onGenerationStart = start;
            input.onGenerationCheckpoint = vi.fn(async () => undefined);
            await run(input, [
                JSON.stringify({
                    ...plan,
                    brief: { tasks: [{ ...task, explanationLanguage: 'en' }] },
                    ...(explicitEnglish
                        ? {
                              explanationLanguageOverrides: [
                                  {
                                      taskId: 'grammar',
                                      language: 'en',
                                      evidence:
                                          'explain the grammar in English',
                                  },
                              ],
                          }
                        : {}),
                }),
                JSON.stringify(authored),
            ]);

            expect(start).toHaveBeenCalledOnce();
            expect(start.mock.calls[0]![0]).toMatchObject({
                replyLanguage: 'en',
                tasks: [
                    {
                        language: 'fr',
                        explanationLanguage: explicitEnglish ? 'en' : 'fr',
                    },
                ],
            });
        },
    );

    it('persists a valid planner receipt atomically with pending state and rejects invalid structured plans', async () => {
        const { input } = fixture();
        const save = vi.spyOn(input.memory, 'writeState');
        await run(input, [
            JSON.stringify({
                kind: 'clarify',
                question: 'Which translation language?',
                replyLanguage: 'en',
                brief: {
                    tasks: [
                        {
                            id: 'words',
                            kind: 'vocabulary',
                            instruction: 'Travel vocabulary.',
                            language: 'fr',
                        },
                    ],
                },
            }),
        ]);

        expect(save.mock.calls.some(([, ids]) => ids?.length === 1)).toBe(true);
        const invalid = fixture().input;
        const invalidSave = vi.spyOn(invalid.memory, 'writeState');
        await expect(
            run(invalid, [JSON.stringify({ kind: 'unknown-operation' })]),
        ).rejects.toThrow();

        expect(
            invalidSave.mock.calls.some(([, ids]) => Boolean(ids?.length)),
        ).toBe(false);
    });

    it('uses a dedicated revision planner and publishes only a reviewed candidate with its receipt', async () => {
        const { input } = fixture();
        const history = vi.spyOn(input.memory, 'listMessages');
        const plan = {
            schemaVersion: 1 as const,
            replyLanguage: 'en',
            sources: [],
            tasks: [
                {
                    id: 'reading',
                    kind: 'prose' as const,
                    instruction: 'Read about civic life.',
                    language: 'fr',
                    inputs: [],
                    targetWords: 300,
                },
            ],
            outputOrder: ['reading'],
        };

        input.generation = {
            runId: randomUUID(),
            revision: 1,
            plan,
            sources: [],
            artifacts: [],
            purpose: 'revision',
        };

        const revised = {
            ...plan,
            tasks: [{ ...plan.tasks[0]!, targetWords: 200 }],
        };

        input.onGenerationRevision = vi.fn(async () => ({ id: randomUUID() }));
        const { provider } = await run(input, [JSON.stringify(revised)]);
        expect(provider.requests).toHaveLength(1);
        expect(history).not.toHaveBeenCalled();
        expect(input.onGenerationRevision).toHaveBeenCalledExactlyOnceWith(
            revised,
            expect.arrayContaining([expect.any(String)]),
        );

        expect(input.onContentProposal).not.toHaveBeenCalled();
        expect(JSON.stringify(provider.requests[0]!.prompt)).toContain(
            'You revise a prepared language-learning GenerationPlan',
        );
    });

    it('freezes the initial host editor excerpt when implicit-source clarification is continued', async () => {
        const { input, memory } = fixture();
        const passage = 'Lucie visite Lyon chaque samedi pour voir sa sœur.';
        const capturedOrigin = {
            noteId: randomUUID(),
            noteVersion: 4,
        };
        const practice = {
            id: 'practice',
            kind: 'exercises',
            instruction: 'Answer a question about the current passage.',
            language: 'fr',
            explanationLanguage: 'fr',
            count: 1,
            activities: [{ activityId: 'R04', count: 1 }],
            sourceText: 'Invented planner passage.',
        };

        input.sourceNote = capturedOrigin;
        input.message.content = 'Make one French reading question.';
        input.message.modelContent = projectTutorUserMessage({
            content: input.message.content,
            editorContext: { content: passage },
        });

        const first = await run(input, [
            JSON.stringify({
                kind: 'clarify',
                question: 'Should the answer be brief?',
                brief: { tasks: [practice] },
            }),
        ]);

        expect(first.provider.requests).toHaveLength(1);
        expect(input.onContentProposal).not.toHaveBeenCalled();
        const saved = memory.state.get(tutorRequestStateKey)!;
        const pending = deserializeLearningContentBrief(saved.pending);
        expect(pending.tasks[0]).toMatchObject({
            id: 'practice',
            sourceText: passage,
            language: 'fr',
            count: 1,
            activities: [{ activityId: 'R04', count: 1 }],
        });

        expect(pending.tasks[0]?.source).toBeUndefined();
        expect(saved.pendingSources).toMatchObject({
            blocks: [],
            tasks: [{ taskId: 'practice', selectionOrigin: capturedOrigin }],
        });

        input.operationId = 'implicit-reading-followup';
        input.sourceNote = { ...capturedOrigin, noteVersion: 5 };
        input.message = {
            ...input.message,
            id: 'implicit-reading-followup',
            content: 'Yes, keep it brief.',
            createdAt: '2026-10-19T00:11:00.000Z',
            modelContent: projectTutorUserMessage({
                content: 'Yes, keep it brief.',
                editorContext: { content: 'CURRENT_EDITOR_REPLACEMENT' },
            }),
        };

        memory.messages.set(input.message.id, input.message);
        const { sourceBindings: _fixtureBindings, ...wire } =
            namedExerciseFixture({
                activityId: 'R04',
                sources: [
                    {
                        id: randomUUID(),
                        type: 'bilingual-text',
                        language: 'fr',
                        translations: [],
                        segments: [{ id: randomUUID(), text: passage }],
                    },
                ],
            });
        const exercise = {
            ...wire,
            question: 'Pourquoi Lucie visite-t-elle Lyon ?',
            referenceAnswer: 'Pour voir sa sœur.',
            explanation:
                'The passage explicitly gives the reason for her visit.',
            sourceBindings: [{ kind: 'text-selection' }],
        };
        const second = await run(input, [
            JSON.stringify({
                kind: 'generate',
                replyLanguage: 'en',
                continuesPending: true,
                brief: {
                    tasks: [
                        { ...practice, sourceText: 'A new model paraphrase.' },
                    ],
                },
            }),
            JSON.stringify({
                tasks: [{ taskId: 'practice', blocks: [exercise] }],
            }),
        ]);

        expect(second.provider.requests).toHaveLength(2);
        expect(
            second.accounting.admit.mock.calls.map(([call]) => call.purpose),
        ).toEqual(['planning', 'authoring']);

        const authorPrompt = JSON.stringify(
            second.provider.requests[1]?.prompt,
        );

        expect(authorPrompt).not.toContain('Invented planner passage.');
        expect(authorPrompt).not.toContain('A new model paraphrase.');
        expect(authorPrompt).not.toContain('CURRENT_EDITOR_REPLACEMENT');
        expect(input.onContentProposal).toHaveBeenCalledExactlyOnceWith(
            {
                body: resultBody({
                    taskId: 'fixture',
                    blocks: [
                        expectedExercise(exercise, 'fr', [
                            {
                                kind: 'text-selection',
                                origin: capturedOrigin,
                                text: passage,
                            },
                        ]),
                    ],
                }),
            },
            expect.arrayContaining([expect.any(String)]),
        );

        expect(memory.state.get(tutorRequestStateKey)?.pending).toBeNull();
        expect(input.onDraft).not.toHaveBeenCalled();
    });

    it('retains a changed global proposal selector through clarification without reusing old captured words', async () => {
        const { input, memory } = fixture();
        const sourceA = randomUUID();
        const sourceB = randomUUID();
        const entryBId = randomUUID();
        const bankA = LearningBlockSchema.parse({
            id: randomUUID(),
            type: 'vocabulary',
            language: 'fr',
            translationLanguage: 'en',
            entries: [{ id: randomUUID(), term: 'chat', translation: 'cat' }],
        });
        const bankB = LearningBlockSchema.parse({
            id: randomUUID(),
            type: 'vocabulary',
            language: 'fr',
            translationLanguage: 'en',
            entries: [{ id: entryBId, term: 'chien', translation: 'dog' }],
        });
        const practice = {
            id: 'practice',
            kind: 'exercises',
            instruction: 'Recall one French word from the chosen proposal.',
            language: 'fr',
            explanationLanguage: 'fr',
            count: 1,
            activities: [{ activityId: 'V01', count: 1 }],
        };
        const previousTask = {
            ...practice,
            words: ['chat'],
            sourceText: 'chat means cat.',
        };

        await memory.port.writeState({
            [tutorRequestStateKey]: {
                pending: JSON.parse(
                    serializeLearningContentBrief({
                        tasks: [previousTask],
                    }),
                ),
                pendingProposalIds: [sourceA],
                pendingSources: {
                    blocks: [bankA],
                    tasks: [
                        {
                            taskId: 'practice',
                            blockIds: [bankA.id],
                            proposalOrigins: [
                                { blockId: bankA.id, proposalId: sourceA },
                            ],
                        },
                    ],
                },
                proposals: [
                    { id: sourceA, summary: 'First word bank.' },
                    { id: sourceB, summary: 'Second word bank.' },
                ],
            },
        });

        input.readContentProposal = vi.fn(async (id) => ({
            id,
            body: resultBody({
                taskId: 'fixture',
                blocks: id === sourceA ? [bankA] : [bankB],
            }),
        }));

        input.message.content = 'Continue using the other word bank.';
        const first = await run(input, [
            JSON.stringify({
                kind: 'generate',
                replyLanguage: 'en',
                continuesPending: true,
                sourceProposalIds: [sourceB],
                brief: { tasks: [practice] },
            }),
            JSON.stringify({
                kind: 'clarify',
                question: 'Which of the two word banks should I use?',
                brief: { tasks: [practice] },
            }),
        ]);

        expect(first.provider.requests).toHaveLength(2);
        expect(
            first.accounting.admit.mock.calls.map(([call]) => call.purpose),
        ).toEqual(['planning', 'planning']);

        expect(input.onContentProposal).not.toHaveBeenCalled();
        const saved = memory.state.get(tutorRequestStateKey)!;
        expect(saved.pendingProposalIds).toEqual([sourceB]);
        const pending = deserializeLearningContentBrief(saved.pending);
        expect(pending.tasks[0]).toMatchObject(practice);
        expect(pending.tasks[0]?.source).toBeUndefined();
        expect(pending.tasks[0]?.words).toBeUndefined();
        expect(pending.tasks[0]?.sourceText).toBeUndefined();
        expect(JSON.stringify(saved.pendingSources ?? {})).not.toContain(
            bankA.id,
        );

        input.operationId = 'global-source-followup';
        input.message = {
            ...input.message,
            id: 'global-source-followup',
            content: `Use proposal ${sourceB}.`,
            createdAt: '2026-10-19T00:11:00.000Z',
        };

        memory.messages.set(input.message.id, input.message);
        const wire = namedExerciseFixture({
            activityId: 'V01',
            sources: [bankB],
        });
        const second = await run(input, [
            JSON.stringify({
                kind: 'generate',
                replyLanguage: 'en',
                continuesPending: true,
                brief: { tasks: [practice] },
            }),
            JSON.stringify({ tasks: [{ taskId: 'practice', blocks: [wire] }] }),
        ]);

        expect(second.provider.requests).toHaveLength(2);
        const authorPrompt = JSON.stringify(
            second.provider.requests[1]?.prompt,
        );

        expect(authorPrompt).toContain('chien');
        expect(authorPrompt).not.toContain('chat');
        expect(authorPrompt).not.toContain(bankA.id);
        expect(authorPrompt).not.toContain(sourceA);
        expect(input.onContentProposal).toHaveBeenCalledExactlyOnceWith(
            {
                body: resultBody({
                    taskId: 'fixture',
                    blocks: [
                        expectedExercise(wire, 'fr', [
                            {
                                kind: 'vocabulary',
                                origin: {
                                    kind: 'proposal',
                                    proposalId: sourceB,
                                    blockId: bankB.id,
                                },
                                entries: [
                                    {
                                        entryId: entryBId,
                                        term: 'chien',
                                        sense: 'dog',
                                    },
                                ],
                            },
                        ]),
                    ],
                }),
            },
            expect.arrayContaining([expect.any(String)]),
        );

        expect(memory.state.get(tutorRequestStateKey)?.pending).toBeNull();
        expect(input.onDraft).not.toHaveBeenCalled();
    });

    it('does not reassign an old captured source when a new unavailable selector is clarified and later continued', async () => {
        const { input, memory } = fixture();
        const bankA = LearningBlockSchema.parse({
            id: randomUUID(),
            type: 'vocabulary',
            language: 'fr',
            translationLanguage: 'en',
            entries: [{ id: randomUUID(), term: 'chat', translation: 'cat' }],
        });
        const bankB = LearningBlockSchema.parse({
            id: randomUUID(),
            type: 'vocabulary',
            language: 'fr',
            translationLanguage: 'en',
            entries: [{ id: randomUUID(), term: 'chien', translation: 'dog' }],
        });
        const oldTask = {
            id: 'practice',
            kind: 'exercises',
            instruction: 'Recall one French word from bank A.',
            language: 'fr',
            explanationLanguage: 'fr',
            count: 1,
            activities: [{ activityId: 'V01', count: 1 }],
            source: { kind: 'editor', blockId: bankA.id },
            sourceText: 'chat',
        };
        const nextTask = {
            id: 'practice',
            kind: 'exercises',
            instruction: 'Recall one French word from bank B.',
            language: 'fr',
            explanationLanguage: 'fr',
            count: 1,
            activities: [{ activityId: 'V01', count: 1 }],
            source: { kind: 'editor', blockId: bankB.id },
        };

        await memory.port.writeState({
            [tutorRequestStateKey]: {
                pending: JSON.parse(
                    serializeLearningContentBrief({ tasks: [oldTask] }),
                ),
                pendingSources: {
                    blocks: [bankA],
                    tasks: [{ taskId: 'practice', blockIds: [bankA.id] }],
                },
                proposals: [],
            },
        });

        input.sourceNote = {
            noteId: '01900000-0000-4000-8000-000000000095',
            noteVersion: 3,
        };

        input.sourceContext = {
            ...input.sourceContext,
            availableBlocks: [bankA, bankB].map((bank) => ({
                id: bank.id,
                type: bank.type,
            })),
            availableMaterialCount: 2,
            blockCatalogComplete: true,
        };

        input.message.content = 'Start a new recall exercise using bank B.';
        input.message.modelContent = projectTutorUserMessage({
            content: input.message.content,
            blockReferences: [bankB.id],
            editorContext: { content: 'The current note contains bank B.' },
        });

        let bankBAvailable = false;
        input.readContext = vi.fn(async ({ blockIds }) => {
            const selected = [bankA, ...(bankBAvailable ? [bankB] : [])].filter(
                (bank) => blockIds?.includes(bank.id),
            );

            return {
                material: selected.map((bank) => ({
                    id: bank.id,
                    label: 'Exact word bank',
                    content: JSON.stringify(bank),
                })),
                total: selected.length,
            };
        });

        const first = await run(input, [
            JSON.stringify({
                kind: 'generate',
                replyLanguage: 'en',
                continuesPending: false,
                brief: { tasks: [nextTask] },
            }),
            JSON.stringify({
                kind: 'clarify',
                replyLanguage: 'en',
                question:
                    'Bank B is unavailable. Select that bank again when it is ready.',
                brief: { tasks: [nextTask] },
            }),
        ]);

        expect(first.provider.requests).toHaveLength(2);
        expect(
            first.accounting.admit.mock.calls.map(([call]) => call.purpose),
        ).toEqual(['planning', 'planning']);

        expect(first.result.text).toContain('Bank B is unavailable');
        expect(input.onContentProposal).not.toHaveBeenCalled();
        const pending = memory.state.get(tutorRequestStateKey)!;
        expect(pending.pending).toMatchObject({
            tasks: [
                {
                    id: 'practice',
                    count: 1,
                    language: 'fr',
                    explanationLanguage: 'fr',
                    activities: [{ activityId: 'V01', count: 1 }],
                    source: { kind: 'editor', blockId: bankB.id },
                },
            ],
        });

        const captured = pending.pendingSources as
            { blocks: LearningBlock[]; tasks: unknown[] } | undefined;

        expect(captured?.blocks ?? []).toEqual([]);
        expect(captured?.tasks ?? []).toEqual([]);

        bankBAvailable = true;
        input.operationId = 'bank-b-followup';
        input.message = {
            ...input.message,
            id: 'bank-b-followup',
            content: 'Bank B is now available; continue with that bank.',
            createdAt: '2026-10-19T00:11:00.000Z',
            modelContent: projectTutorUserMessage({
                content: 'Bank B is now available; continue with that bank.',
                blockReferences: [bankB.id],
                editorContext: { content: 'Bank B contains chien — dog.' },
            }),
        };

        memory.messages.set(input.message.id, input.message);
        const wire = namedExerciseFixture({
            activityId: 'V01',
            sources: [bankB],
        });
        const second = await run(input, [
            JSON.stringify({
                kind: 'generate',
                replyLanguage: 'en',
                continuesPending: true,
                brief: { tasks: [nextTask] },
            }),
            JSON.stringify({ tasks: [{ taskId: 'practice', blocks: [wire] }] }),
        ]);

        expect(second.provider.requests).toHaveLength(2);
        expect(
            second.accounting.admit.mock.calls.map(([call]) => call.purpose),
        ).toEqual(['planning', 'authoring']);

        expect(
            vi
                .mocked(input.readContext)
                .mock.calls.map(([query]) => query.blockIds),
        ).toEqual([[bankB.id], [bankB.id]]);

        const authorPrompt = JSON.stringify(
            second.provider.requests[1]!.prompt,
        );

        expect(authorPrompt).toContain(bankB.id);
        expect(authorPrompt).not.toContain(bankA.id);
        if (bankB.type !== 'vocabulary') {
            throw new Error('Expected canonical vocabulary fixture.');
        }

        expect(input.onContentProposal).toHaveBeenCalledExactlyOnceWith(
            {
                body: resultBody({
                    taskId: 'fixture',
                    blocks: [
                        expectedExercise(wire, 'fr', [
                            {
                                kind: 'vocabulary',
                                origin: {
                                    kind: 'block',
                                    blockId: bankB.id,
                                },
                                entries: [
                                    {
                                        entryId: bankB.entries[0]!.id,
                                        term: 'chien',
                                        sense: 'dog',
                                    },
                                ],
                            },
                        ]),
                    ],
                }),
            },
            expect.arrayContaining([expect.any(String)]),
        );

        expect(input.onDraft).not.toHaveBeenCalled();
        expect(memory.state.get(tutorRequestStateKey)?.pending).toBeNull();
    });

    it.each(['generate', 'clarify'] as const)(
        'handles the aggregate pending-source bound during %s without an authoring dispatch or invalid saved state',
        async (kind) => {
            const { input, memory } = fixture();
            const sources = Array.from({ length: 3 }, (_, bank) =>
                LearningBlockSchema.parse({
                    id: randomUUID(),
                    type: 'vocabulary',
                    language: 'fr',
                    translationLanguage: 'en',
                    title: `Word bank ${bank + 1}`,
                    entries: Array.from({ length: 3 }, (_, index) => ({
                        id: randomUUID(),
                        term: `word-${bank}-${index}`,
                        translation: 't'.repeat(1_000),
                        definition: 'BOUND_BANK_MARKER ' + 'd'.repeat(1_780),
                        example: 'e'.repeat(1_800),
                        exampleTranslation: 'x'.repeat(1_800),
                        pronunciation: 'p'.repeat(400),
                    })),
                }),
            );
            const sourceBytes = sources.map((source) =>
                Buffer.byteLength(JSON.stringify(source), 'utf8'),
            );

            expect(
                sourceBytes.every((bytes) => bytes > 20_000 && bytes < 23_000),
            ).toBe(true);

            expect(sourceBytes.every((bytes) => bytes < 80_000)).toBe(true);
            expect(
                Buffer.byteLength(JSON.stringify(sources), 'utf8'),
            ).toBeGreaterThan(60_000);

            input.sourceNote = {
                noteId: '01900000-0000-4000-8000-000000000095',
                noteVersion: 3,
            };

            input.sourceContext = {
                ...input.sourceContext,
                availableBlocks: sources.map((source) => ({
                    id: source.id,
                    type: source.type,
                })),
                availableMaterialCount: sources.length,
                blockCatalogComplete: true,
            };

            input.message.content =
                'Prepare one recall exercise from each of these three word banks.';

            input.message.modelContent = projectTutorUserMessage({
                content: input.message.content,
                editorContext: { content: 'Three selected French word banks.' },
            });

            input.readContext = vi.fn(async ({ blockIds }) => {
                const selected = sources.filter((source) =>
                    blockIds?.includes(source.id),
                );

                return {
                    material: selected.map((source) => ({
                        id: source.id,
                        label: source.title!,
                        content: JSON.stringify(source),
                    })),
                    total: selected.length,
                };
            });

            input.onContentBatch = vi.fn(async () => []);
            const tasks = sources.map((source, index) => ({
                id: `bank-${index}`,
                kind: 'exercises',
                instruction: 'Recall one selected word from this bank.',
                language: 'fr',
                explanationLanguage: 'fr',
                count: 1,
                activities: [{ activityId: 'V01', count: 1 }],
                source: { kind: 'editor', blockId: source.id },
            }));
            const planned =
                kind === 'generate'
                    ? { kind, replyLanguage: 'en', brief: { tasks } }
                    : {
                          kind,
                          replyLanguage: 'en',
                          question: 'Which bank should we start with?',
                          brief: { tasks },
                      };
            const provider = scriptedTutorModel([JSON.stringify(planned)]);
            const accounting = tutorAccountingFixture();
            const result = await createContextualTutorRunner({
                model: provider.model,
                accounting,
                maxInputTokens: 64_000,
            }).run(input);

            expect(provider.requests).toHaveLength(1);
            expect(
                accounting.admit.mock.calls.map(([call]) => call.purpose),
            ).toEqual(['planning']);

            expect(
                accounting.admit.mock.calls[0]![0].inputTokenEstimate,
            ).toBeLessThan(64_000);

            expect(input.readContext).toHaveBeenCalledTimes(3);
            expect(
                vi
                    .mocked(input.readContext)
                    .mock.calls.map(([query]) => query.blockIds),
            ).toEqual(sources.map((source) => [source.id]));

            expect(input.onContentProposal).not.toHaveBeenCalled();
            expect(input.onContentBatch).not.toHaveBeenCalled();
            expect(result.text).toMatch(/smaller|shorter|fewer/iu);
            expect(result.text).toMatch(/vocabulary|passage|source/iu);
            expect(input.onResponseMetadata).toHaveBeenLastCalledWith({
                kind: 'clarification',
                documentUse: false,
            });

            const saved = memory.state.get(tutorRequestStateKey);
            expect(saved?.pending).toBeNull();
            expect(saved?.pendingSources).toBeUndefined();
            expect(JSON.stringify(saved)).not.toContain('BOUND_BANK_MARKER');
            expect(JSON.stringify(saved).length).toBeLessThan(60_000);
        },
    );

    it('retains an automatic production allocation and its objective while clarifying a missing prerequisite', () => {
        const planned = TutorRequestResolutionSchema.parse({
            kind: 'clarify',
            question: 'Which vocabulary source should the sentence tasks use?',
            brief: {
                tasks: [
                    {
                        id: 'planner-practice',
                        kind: 'exercises',
                        instruction:
                            'Use the selected words in complete French sentences.',
                        count: 2,
                        language: 'fr',
                        activities: [{ activityId: 'V07', count: 2 }],
                    },
                ],
            },
        });
        const result = applyExercisePickerChoices(
            {
                mode: 'automatic',
                count: 2,
                language: 'fr',
                explanationLanguage: 'en',
                difficulty: 'beginner',
            },
            planned,
            false,
        );

        expect(result).toMatchObject({
            kind: 'clarify',
            question: 'Which vocabulary source should the sentence tasks use?',
            brief: {
                tasks: [
                    {
                        instruction:
                            'Use the selected words in complete French sentences.',
                        count: 2,
                        activities: [{ activityId: 'V07', count: 2 }],
                    },
                ],
            },
        });
    });

    it.each([
        {
            activities: [{ activityId: 'V07' }],
            valid: true,
            expected: [{ activityId: 'V07', count: 2 }],
        },
        {
            activities: [
                { activityId: 'V01', count: 1 },
                { activityId: 'V07', count: 1 },
            ],
            valid: true,
            expected: [
                { activityId: 'V01', count: 1 },
                { activityId: 'V07', count: 1 },
            ],
        },
        {
            activities: [
                { activityId: 'V01' },
                { activityId: 'V07', count: 1 },
            ],
            valid: false,
        },
        {
            activities: [
                { activityId: 'V01', count: 2 },
                { activityId: 'V07', count: 1 },
            ],
            valid: false,
        },
        {
            activities: [
                { activityId: 'V01', count: 1 },
                { activityId: 'V01', count: 1 },
            ],
            valid: false,
        },
    ])(
        'validates automatic planner allocations without discarding the production goal: %j',
        ({ activities, valid, expected }) => {
            const planned = TutorRequestResolutionSchema.parse({
                kind: 'generate',
                replyLanguage: 'en',
                brief: {
                    tasks: [
                        {
                            id: 'planner-practice',
                            kind: 'exercises',
                            instruction: 'Use the words in original sentences.',
                            language: 'fr',
                            count: 2,
                            activities,
                        },
                    ],
                },
            });
            const result = applyExercisePickerChoices(
                {
                    mode: 'automatic',
                    count: 2,
                    language: 'fr',
                    explanationLanguage: 'en',
                    difficulty: 'beginner',
                },
                planned,
                false,
            );

            expect(result.kind).toBe(valid ? 'generate' : 'clarify');
            if (valid && result.kind === 'generate') {
                expect(result.brief.tasks[0]).toMatchObject({
                    instruction: 'Use the words in original sentences.',
                    count: 2,
                    activities: expected,
                });
            }
        },
    );

    it('keeps automatic-mode sentence production selected by the planner instead of replacing it with a default recognition activity', async () => {
        const { input } = fixture();
        const source: LearningBlock = {
            id: blockId,
            type: 'vocabulary',
            language: 'fr',
            translationLanguage: 'en',
            entries: [
                {
                    id: '01900000-0000-4000-8000-000000000003',
                    term: 'chat',
                    translation: 'cat',
                },
            ],
        };
        const goal =
            'Write one complete French sentence using chat with its selected meaning.';
        const request = {
            mode: 'automatic' as const,
            count: 1,
            language: 'fr',
            explanationLanguage: 'en',
            difficulty: 'beginner' as const,
        };

        input.sourceNote = {
            noteId: '01900000-0000-4000-8000-000000000095',
            noteVersion: 3,
        };

        input.sourceContext = {
            ...input.sourceContext,
            availableBlocks: [{ id: source.id, type: source.type }],
            availableMaterialCount: 1,
            blockCatalogComplete: true,
        };

        input.message.content = goal;
        input.message.modelContent = projectTutorUserMessage({
            content: goal,
            exerciseRequest: request,
            blockReferences: [source.id],
            editorContext: { content: 'The selected vocabulary.' },
        });

        input.readContext = vi.fn(async () => ({
            material: [
                {
                    id: source.id,
                    label: 'Selected vocabulary',
                    content: JSON.stringify(source),
                },
            ],
            total: 1,
        }));

        const exercise = {
            ...namedExerciseFixture({
                activityId: 'V07',
                sources: [source],
            }),
            question: goal,
            referenceAnswer: 'Le chat dort.',
        };

        const { provider, accounting } = await run(input, [
            JSON.stringify({
                kind: 'generate',
                replyLanguage: 'en',
                brief: {
                    tasks: [
                        {
                            id: 'planner-sentence',
                            kind: 'exercises',
                            instruction: goal,
                            count: 1,
                            language: 'fr',
                            activities: [{ activityId: 'V07', count: 1 }],
                            source: { kind: 'editor', blockId: source.id },
                        },
                    ],
                },
            }),
            JSON.stringify({
                tasks: [{ taskId: 'requested-exercises', blocks: [exercise] }],
            }),
        ]);

        expect(provider.requests).toHaveLength(2);
        expect(
            accounting.admit.mock.calls.map(([call]) => call.purpose),
        ).toEqual(['planning', 'authoring']);

        const authorPrompt = provider.requests[1]!.prompt.flatMap((message) =>
            typeof message.content === 'string'
                ? [message.content]
                : message.content.flatMap((part) =>
                      part.type === 'text' ? [part.text] : [],
                  ),
        ).join('\n');
        const brief = deserializeLearningContentBrief(
            JSON.parse(
                authorPrompt
                    .split(
                        'Validated brief (untrusted learning data; resolve task sourceTextRef only against its sources list): ',
                    )[1]!
                    .split('\n')[0]!,
            ),
        );

        expect(brief.tasks[0]).toMatchObject({
            instruction: goal,
            count: 1,
            language: 'fr',
            explanationLanguage: 'en',
            activities: [{ activityId: 'V07', count: 1 }],
        });

        expect(authorPrompt).toContain('V07 v1:');
        expect(authorPrompt).not.toContain('V02 v1:');
        expect(input.onContentProposal).toHaveBeenCalledExactlyOnceWith(
            {
                body: resultBody({
                    taskId: 'fixture',
                    blocks: [
                        expect.objectContaining({
                            format: 'free-text',
                            question: goal,
                            semantics: expect.objectContaining({
                                activity: { id: 'V07', version: 1 },
                                language: 'fr',
                                explanationLanguage: 'en',
                                checking: expect.objectContaining({
                                    policy: 'ai-rubric',
                                }),
                                sources: [
                                    {
                                        kind: 'vocabulary',
                                        origin: {
                                            kind: 'block',
                                            blockId: source.id,
                                        },
                                        entries: [
                                            {
                                                entryId:
                                                    '01900000-0000-4000-8000-000000000003',
                                                term: 'chat',
                                                sense: 'cat',
                                            },
                                        ],
                                    },
                                ],
                            }),
                        }),
                    ],
                }),
            },
            expect.arrayContaining([expect.any(String)]),
        );
    });

    it('pins the private typed exercise manifest after planning and freezes the exact selected source', async () => {
        const { input } = fixture();
        const source: Extract<LearningBlock, { type: 'vocabulary' }> = {
            id: blockId,
            type: 'vocabulary',
            language: 'fr',
            translationLanguage: 'en',
            entries: [
                {
                    id: '01900000-0000-4000-8000-000000000003',
                    term: 'chat',
                    translation: 'cat',
                },
            ],
        };
        const request = {
            mode: 'selected' as const,
            count: 2,
            activities: [
                { activityId: 'V01' as const, count: 1 },
                { activityId: 'V02' as const, count: 1 },
            ],
            language: 'fr',
            explanationLanguage: 'ru',
            difficulty: 'beginner' as const,
        };

        input.preferences = { ...input.preferences, replyLanguage: 'en' };
        input.sourceNote = {
            noteId: '01900000-0000-4000-8000-000000000095',
            noteVersion: 3,
        };

        input.sourceContext = {
            ...input.sourceContext,
            availableBlocks: [{ id: source.id, type: source.type }],
            availableMaterialCount: 1,
            blockCatalogComplete: true,
        };

        input.message.content =
            'Generate the selected exercises from this vocabulary.';

        input.message.modelContent = projectTutorUserMessage({
            content: input.message.content,
            promptMentions: [
                {
                    kind: 'exercise',
                    activityId: 'V01',
                    catalogVersion: 1,
                    start: 0,
                    end: 8,
                },
                {
                    kind: 'exercise',
                    activityId: 'V02',
                    catalogVersion: 1,
                    start: 9,
                    end: 12,
                },
            ],
            exerciseRequest: request,
            blockReferences: [source.id],
            editorContext: {
                content:
                    'The current note contains the selected vocabulary block.',
            },
        });

        input.readContext = vi.fn(async () => ({
            material: [
                {
                    id: source.id,
                    label: 'Selected vocabulary',
                    content: JSON.stringify(source),
                },
            ],
            total: 1,
        }));

        const exercises = request.activities.map(({ activityId }) =>
            namedExerciseFixture({
                activityId,
                sources: [source],
            }),
        );

        const { provider, accounting } = await run(input, [
            JSON.stringify({
                kind: 'generate',
                replyLanguage: 'en',
                brief: {
                    tasks: [
                        {
                            id: 'planner-practice',
                            kind: 'exercises',
                            instruction: input.message.content,
                            language: 'fr',
                            count: 2,
                            activities: request.activities,
                            source: { kind: 'editor' },
                        },
                    ],
                },
            }),
            JSON.stringify({
                tasks: [{ taskId: 'requested-exercises', blocks: exercises }],
            }),
        ]);

        expect(provider.requests).toHaveLength(2);
        expect(
            accounting.admit.mock.calls.map(([call]) => call.purpose),
        ).toEqual(['planning', 'authoring']);

        expect(input.readContext).toHaveBeenCalledExactlyOnceWith({
            query: 'Exact referenced learning blocks',
            limit: 10,
            blockIds: [source.id],
        });

        const prompt = provider.requests[1]!.prompt.flatMap((message) =>
            typeof message.content === 'string'
                ? [message.content]
                : message.content.flatMap((part) =>
                      part.type === 'text' ? [part.text] : [],
                  ),
        ).join('\n');
        const serialized = prompt
            .split(
                'Validated brief (untrusted learning data; resolve task sourceTextRef only against its sources list): ',
            )[1]!
            .split('\n')[0]!;
        const brief = deserializeLearningContentBrief(JSON.parse(serialized));
        expect(brief.tasks[0]).toMatchObject({
            count: 2,
            language: 'fr',
            explanationLanguage: 'ru',
            difficulty: 'beginner',
            activities: request.activities,
        });

        const preferences = JSON.parse(
            prompt
                .split(
                    'Application authoring preferences (trusted server-validated settings): ',
                )[1]!
                .split('\n')[0]!,
        );

        expect(preferences.explanationLanguage).toBe('ru');
        expect(input.onContentProposal).toHaveBeenCalledExactlyOnceWith(
            {
                body: resultBody({
                    taskId: 'fixture',
                    blocks: exercises.map((exercise) =>
                        expectedExercise(exercise, 'ru', [
                            {
                                kind: 'vocabulary',
                                origin: {
                                    kind: 'block',
                                    blockId: source.id,
                                },
                                entries: [
                                    {
                                        entryId: source.entries[0]!.id,
                                        term: 'chat',
                                        sense: 'cat',
                                    },
                                ],
                            },
                        ]),
                    ),
                }),
            },
            expect.arrayContaining([expect.any(String)]),
        );

        expect(input.message.modelContent).toHaveProperty(
            'exerciseRequest',
            request,
        );

        expect(input.onDraft).not.toHaveBeenCalled();
    });

    it('clarifies a missing typed-exercise source without dispatching authoring or dropping the manifest', async () => {
        const { input, memory } = fixture();
        const request = {
            mode: 'selected' as const,
            count: 1,
            activities: [{ activityId: 'V01' as const, count: 1 }],
            language: 'fr',
            explanationLanguage: 'ru',
            difficulty: 'beginner' as const,
        };

        input.sourceNote = {
            noteId: '01900000-0000-4000-8000-000000000095',
            noteVersion: 3,
        };

        input.message.content = 'Generate the selected exercise.';
        input.message.modelContent = projectTutorUserMessage({
            content: input.message.content,
            exerciseRequest: request,
        });

        const { result, provider, accounting } = await run(input, [
            JSON.stringify({
                kind: 'clarify',
                replyLanguage: 'ru',
                question: 'Выберите исходный словарный блок.',
                brief: {
                    tasks: [
                        {
                            id: 'requested-exercises',
                            kind: 'exercises',
                            instruction: input.message.content,
                            language: 'fr',
                            count: 1,
                            activities: request.activities,
                            source: { kind: 'editor' },
                        },
                    ],
                },
            }),
        ]);

        expect(result.text).toBe('Выберите исходный словарный блок.');
        expect(provider.requests).toHaveLength(1);
        expect(
            accounting.admit.mock.calls.map(([call]) => call.purpose),
        ).toEqual(['planning']);

        expect(input.onContentProposal).not.toHaveBeenCalled();
        expect(input.onDraft).not.toHaveBeenCalled();
        expect(memory.state.get(tutorRequestStateKey)?.pending).toMatchObject({
            tasks: [
                {
                    id: 'requested-exercises',
                    count: 1,
                    language: 'fr',
                    explanationLanguage: 'ru',
                    activities: request.activities,
                },
            ],
        });
    });

    it.each(['count', 'source'] as const)(
        'clarifies a planner %s that contradicts the selected manifest without replacing its activity allocation or source',
        async (conflict) => {
            const { input, memory } = fixture();
            const source: LearningBlock = {
                id: blockId,
                type: 'vocabulary',
                language: 'fr',
                translationLanguage: 'en',
                entries: [
                    { id: randomUUID(), term: 'chat', translation: 'cat' },
                ],
            };
            const request = {
                mode: 'selected' as const,
                count: 1,
                activities: [{ activityId: 'V01' as const, count: 1 }],
                language: 'fr',
                explanationLanguage: 'ru',
                difficulty: 'beginner' as const,
            };

            input.sourceNote = {
                noteId: '01900000-0000-4000-8000-000000000095',
                noteVersion: 3,
            };

            input.sourceContext = {
                ...input.sourceContext,
                availableBlocks: [{ id: source.id, type: source.type }],
                availableMaterialCount: 1,
                blockCatalogComplete: true,
            };

            input.message.content =
                conflict === 'count'
                    ? 'Generate three exercises from this vocabulary.'
                    : 'Generate an exercise from the other vocabulary block.';

            input.message.modelContent = projectTutorUserMessage({
                content: input.message.content,
                exerciseRequest: request,
                blockReferences: [source.id],
                editorContext: { content: 'The selected vocabulary.' },
            });

            input.readContext = vi.fn(async () => ({
                material: [
                    {
                        id: source.id,
                        label: 'Selected vocabulary',
                        content: JSON.stringify(source),
                    },
                ],
                total: 1,
            }));

            const { result, provider, accounting } = await run(input, [
                JSON.stringify({
                    kind: 'generate',
                    replyLanguage: 'en',
                    brief: {
                        tasks: [
                            {
                                id: 'planner-practice',
                                kind: 'exercises',
                                instruction: input.message.content,
                                language: 'fr',
                                count: conflict === 'count' ? 3 : 1,
                                activities: [
                                    {
                                        activityId: 'V01',
                                        count: conflict === 'count' ? 3 : 1,
                                    },
                                ],
                                source: {
                                    kind: 'editor',
                                    ...(conflict === 'source'
                                        ? {
                                              blockId:
                                                  '01900000-0000-4000-8000-000000000096',
                                          }
                                        : {}),
                                },
                            },
                        ],
                    },
                }),
            ]);

            expect(provider.requests).toHaveLength(1);
            expect(
                accounting.admit.mock.calls.map(([call]) => call.purpose),
            ).toEqual(['planning']);

            expect(result.text.length).toBeGreaterThan(0);
            expect(input.onResponseMetadata).toHaveBeenLastCalledWith({
                kind: 'clarification',
                documentUse: false,
            });

            expect(input.onContentProposal).not.toHaveBeenCalled();
            expect(input.onDraft).not.toHaveBeenCalled();
            expect(
                memory.state.get(tutorRequestStateKey)?.pending,
            ).toMatchObject({
                tasks: [
                    {
                        count: 1,
                        language: 'fr',
                        explanationLanguage: 'ru',
                        activities: request.activities,
                        source: { kind: 'editor', blockId: source.id },
                    },
                ],
            });
        },
    );

    it('grounds planner source descriptors before storing clarification or authoring later', async () => {
        const { input, memory } = fixture();
        input.message.modelContent = projectTutorUserMessage({
            content: input.message.content,
            editorContext: { content: 'Exact original source.' },
        });

        const sourceTask = {
            ...task,
            source: { kind: 'editor' },
            sourceText: 'Invented planner source.',
        };

        await run(input, [
            JSON.stringify({
                kind: 'clarify',
                question: 'Which detail level?',
                brief: { tasks: [sourceTask] },
            }),
        ]);

        const stored = memory.state.get(tutorRequestStateKey)?.pending;
        expect(JSON.stringify(stored)).toContain('Exact original source.');
        expect(JSON.stringify(stored)).not.toContain(
            'Invented planner source.',
        );

        input.message = {
            ...input.message,
            id: 'next',
            content: 'Brief.',
            modelContent: projectTutorUserMessage({
                content: 'Brief.',
                editorContext: { content: 'Newer editor source.' },
            }),
        };

        memory.messages.set(input.message.id, input.message);
        const { provider } = await run(input, [
            JSON.stringify({
                ...plan,
                continuesPending: true,
                brief: { tasks: [sourceTask] },
            }),
            JSON.stringify(authored),
        ]);
        const author = JSON.stringify(provider.requests[1]?.prompt);
        expect(author).toContain('Exact original source.');
        expect(author).not.toContain('Invented planner source.');
        expect(author).not.toContain('Newer editor source.');
        expect(input.onContentProposal).toHaveBeenCalledOnce();
    });

    it('supplies host-owned batching policy alongside a complete pending request and an obsolete refusal', async () => {
        const { input, memory } = fixture();
        const plan = structuredClone(shoppingPlan);

        plan.brief.tasks[0]!.language = 'fr';
        plan.brief.tasks[0]!.translationLanguage = 'ru';
        input.message.content =
            'Generate all 50 French shopping terms with Russian translations.';

        memory.state.set(tutorRequestStateKey, {
            pending: JSON.parse(
                serializeLearningContentBrief(
                    LearningContentBriefSchema.parse(plan.brief),
                ),
            ),
            proposals: [],
        });

        memory.messages.set('obsolete-refusal', {
            id: 'obsolete-refusal',
            role: 'assistant',
            content:
                'The 50-entry vocabulary block exceeded the generation limit. Would you prefer fewer entries?',
            createdAt: '2026-10-19T00:09:00.000Z',
        });

        const provider = shoppingModel(plan);
        await createContextualTutorRunner({
            model: provider.model,
            accounting: tutorAccountingFixture(),
            maxInputTokens: 100_000,
        }).run(input);

        const prompt = provider.requests[0]!.prompt.flatMap((message) =>
            typeof message.content === 'string'
                ? [message.content]
                : message.content.flatMap((part) =>
                      part.type === 'text' ? [part.text] : [],
                  ),
        );
        const planningInput = prompt
            .map((part) => {
                try {
                    return JSON.parse(part) as Record<string, unknown>;
                } catch {
                    return null;
                }
            })
            .find((part) => part?.currentMessage);

        expect(prompt.join('\n')).toContain(
            'Capacity decisions belong exclusively to the host after intent resolution.',
        );

        expect(planningInput).toMatchObject({
            hostExecutionPolicy: {
                capacityAuthority: 'host',
                vocabularyBatching: 'automatic',
                vocabularyPublication: 'one-complete-block',
                priorAssistantCapacityClaimsAuthoritative: false,
            },
            pendingBrief: {
                tasks: [
                    { count: 50, language: 'fr', translationLanguage: 'ru' },
                ],
            },
            recentMessages: expect.arrayContaining([
                expect.objectContaining({
                    role: 'assistant',
                    content:
                        'The 50-entry vocabulary block exceeded the generation limit. Would you prefer fewer entries?',
                }),
            ]),
        });

        expect(provider.requests).toHaveLength(3);
        expect(input.onContentProposal).toHaveBeenCalledOnce();
        expect(memory.state.get(tutorRequestStateKey)?.pending).toBeNull();
    });

    it('generates all 50 shopping terms in bounded calls and persists one complete vocabulary proposal', async () => {
        const { input, memory } = fixture();
        input.message.content =
            'Generate vocabulary with the top 50 words used in the context of shopping.';

        const provider = shoppingModel();
        const accounting = tutorAccountingFixture();
        const result = await createContextualTutorRunner({
            model: provider.model,
            accounting,
            maxInputTokens: 100_000,
        }).run(input);

        expect(result.text).not.toContain('will not fit');
        expect(provider.requests).toHaveLength(3);
        expect(
            accounting.admit.mock.calls.map(([call]) => call.purpose),
        ).toEqual(['planning', 'authoring', 'authoring']);

        expect(
            provider.requests.map((request) => request.maxOutputTokens),
        ).toEqual([2048, 4096, 4096]);

        expect(input.onContentProposal).toHaveBeenCalledOnce();
        const proposal = vi.mocked(input.onContentProposal!).mock.calls[0]![0];
        expect(bodyBlocks(proposal.body)).toHaveLength(1);
        const block = bodyBlocks(proposal.body)[0]!;
        expect(block.type).toBe('vocabulary');
        if (block.type !== 'vocabulary') {
            throw new Error('Expected the compiled vocabulary block.');
        }

        expect(block.entries).toHaveLength(50);
        expect(new Set(block.entries.map((entry) => entry.term)).size).toBe(50);
        expect(new Set(block.entries.map((entry) => entry.id)).size).toBe(50);
        expect(input.onResponseMetadata).toHaveBeenCalledWith({
            kind: 'generation',
            documentUse: false,
        });

        expect(memory.state.get(tutorRequestStateKey)).toMatchObject({
            pending: null,
            proposals: [{ id: proposalId }],
        });
    });

    it('repairs a completed candidate rejected by the narrowed provider schema without publishing it', async () => {
        const { input } = fixture();
        const wrongKind = {
            tasks: [
                {
                    taskId: 'grammar',
                    blocks: [
                        {
                            id: blockId,
                            type: 'vocabulary',
                            language: 'fr',
                            translationLanguage: 'ru',
                            entries: [
                                {
                                    id: proposalId,
                                    term: 'chat',
                                    translation: 'кот',
                                },
                            ],
                        },
                    ],
                },
            ],
        };
        const { accounting, provider } = await run(input, [
            JSON.stringify(plan),
            JSON.stringify(wrongKind),
            JSON.stringify(authored),
        ]);

        expect(
            accounting.admit.mock.calls.map(([call]) => call.purpose),
        ).toEqual(['planning', 'authoring', 'authoring']);

        const repairPrompt = JSON.stringify(provider.requests[2]?.prompt);
        expect(repairPrompt).toContain('tasks.0.blocks.0.type');
        expect(repairPrompt).not.toContain('кот');

        expect(input.onContentProposal).toHaveBeenCalledExactlyOnceWith(
            {
                body: resultBody({ taskId: 'fixture', blocks: [grammar] }),
            },
            expect.arrayContaining([expect.any(String)]),
        );
    });

    it.each(['G03', 'R08'] as const)(
        'revises %s through the provider SDK while preserving identity and frozen provenance',
        async (activityId) => {
            const { input } = fixture();
            const source = LearningBlockSchema.parse(
                activityId === 'G03'
                    ? grammar
                    : {
                          id: randomUUID(),
                          type: 'bilingual-text',
                          language: 'fr',
                          segments: [
                              { id: randomUUID(), text: 'Ana lit ce livre.' },
                          ],
                          translations: [],
                      },
            );
            const exercise = completeNamedExerciseSources(
                namedExerciseFixture({ activityId, sources: [source] }),
                { blocks: [source] },
                { language: 'fr', explanationLanguage: 'en' },
            );

            if (exercise.type !== 'exercise' || !exercise.semantics) {
                throw new Error('Expected a named exercise.');
            }

            const { source: _source, semantics, ...renderer } = exercise;
            const { sources: _bindings, ...authoredSemantics } = semantics;
            const question = 'Appliquez la consigne au document.';
            input.sourceContext.availableBlocks = [exercise];
            input.readContext = async () => ({
                material: [
                    {
                        id: exercise.id,
                        label: 'Frozen exercise',
                        content: JSON.stringify(exercise),
                    },
                ],
                total: 1,
            });

            const { provider } = await run(input, [
                JSON.stringify({
                    kind: 'revise-blocks',
                    sourceBlockIds: [exercise.id],
                    instruction: 'Clarify the question.',
                }),
                JSON.stringify({
                    proposals: [
                        {
                            targetBlockId: exercise.id,
                            blocks: [
                                {
                                    ...renderer,
                                    question,
                                    semantics: authoredSemantics,
                                },
                            ],
                        },
                    ],
                }),
            ]);

            expect(provider.requests).toHaveLength(2);
            expect(input.onContentProposal).toHaveBeenCalledExactlyOnceWith(
                {
                    targetBlockId: exercise.id,
                    body: resultBody({
                        taskId: 'fixture',
                        blocks: [{ ...exercise, question }],
                    }),
                },
                expect.arrayContaining([expect.any(String)]),
            );
        },
    );

    it('normalizes unchanged vocabulary identities before publishing a canonical revision', async () => {
        const { input } = fixture();
        input.onContentBatch = vi.fn(async () => []);
        const entryId = randomUUID();
        const vocabulary = {
            id: blockId,
            type: 'vocabulary',
            language: 'fr',
            translationLanguage: 'en',
            entries: [{ id: entryId, term: 'bonjour', translation: 'hello' }],
        };

        input.sourceContext.availableBlocks = [vocabulary];
        input.readContext = async () => ({
            material: [
                {
                    id: blockId,
                    label: 'Frozen vocabulary',
                    content: JSON.stringify(vocabulary),
                },
            ],
            total: 1,
        });

        const { provider } = await run(input, [
            JSON.stringify({
                kind: 'revise-blocks',
                sourceBlockIds: [blockId],
                instruction: 'Improve the translation.',
            }),
            JSON.stringify({
                proposals: [
                    {
                        targetBlockId: blockId,
                        blocks: [
                            {
                                ...vocabulary,
                                entries: [
                                    {
                                        id: randomUUID(),
                                        term: 'bonjour',
                                        translation: 'good morning',
                                    },
                                ],
                            },
                        ],
                    },
                ],
            }),
        ]);

        expect(provider.requests).toHaveLength(2);
        expect(input.onContentProposal).toHaveBeenCalledExactlyOnceWith(
            {
                targetBlockId: blockId,
                body: resultBody({
                    taskId: 'fixture',
                    blocks: [
                        {
                            ...vocabulary,
                            entries: [
                                {
                                    id: entryId,
                                    term: 'bonjour',
                                    translation: 'good morning',
                                },
                            ],
                        },
                    ],
                }),
            },
            expect.arrayContaining([expect.any(String)]),
        );

        expect(input.onContentBatch).not.toHaveBeenCalled();
    });

    it('validates the entire canonical revision set before any proposal publication', async () => {
        const { input, memory } = fixture();
        const receipts = [{ id: proposalId }, { id: randomUUID() }];
        input.onContentBatch = vi.fn(async () => receipts);
        const second = {
            ...grammar,
            id: '01900000-0000-4000-8000-000000000091',
            rule: 'Second frozen rule.',
        };

        input.sourceContext.availableBlocks = [grammar, second];
        input.readContext = vi.fn(async () => ({
            material: [grammar, second].map((block) => ({
                id: block.id,
                label: 'Frozen grammar',
                content: JSON.stringify(block),
            })),
            total: 2,
        }));

        const first = {
            targetBlockId: grammar.id,
            blocks: [{ ...grammar, rule: 'First revised rule.' }],
        };
        const last = {
            targetBlockId: second.id,
            blocks: [{ ...second, rule: 'Second revised rule.' }],
        };
        const { provider } = await run(input, [
            JSON.stringify({
                kind: 'revise-blocks',
                sourceBlockIds: [grammar.id, second.id],
                instruction: 'Clarify both rules.',
            }),
            JSON.stringify({ proposals: [first] }),
            JSON.stringify({ proposals: [first, last] }),
        ]);

        expect(provider.requests).toHaveLength(3);
        expect(input.onContentBatch).toHaveBeenCalledExactlyOnceWith(
            [
                {
                    targetBlockId: first.targetBlockId,
                    body: resultBody({
                        taskId: 'fixture',
                        blocks: first.blocks,
                    }),
                },
                {
                    targetBlockId: last.targetBlockId,
                    body: resultBody({
                        taskId: 'fixture',
                        blocks: last.blocks,
                    }),
                },
            ],
            expect.arrayContaining([expect.any(String)]),
        );

        expect(input.onContentProposal).not.toHaveBeenCalled();
        expect(memory.state.get(tutorRequestStateKey)?.proposals).toEqual(
            receipts.map(({ id }) => expect.objectContaining({ id })),
        );
    });

    it.each(['reject', 'abort', 'incomplete-receipts'] as const)(
        'does not fall back to single writes or expose partial revision receipts when batch publication %s occurs',
        async (failure) => {
            const { input, memory } = fixture();
            const second = {
                ...grammar,
                id: '01900000-0000-4000-8000-000000000091',
                rule: 'Second frozen rule.',
            };
            const proposals = [
                {
                    targetBlockId: grammar.id,
                    blocks: [{ ...grammar, rule: 'First revised rule.' }],
                },
                {
                    targetBlockId: second.id,
                    blocks: [{ ...second, rule: 'Second revised rule.' }],
                },
            ];

            input.sourceContext.availableBlocks = [grammar, second];
            input.readContext = vi.fn(async () => ({
                material: [grammar, second].map((block) => ({
                    id: block.id,
                    label: 'Frozen grammar',
                    content: JSON.stringify(block),
                })),
                total: 2,
            }));

            const controller = new AbortController();
            input.signal = controller.signal;
            input.onTool = vi.fn(async () => undefined);
            input.onContentBatch = vi.fn(async () => {
                if (failure === 'reject') {
                    throw new Error('Atomic publication rejected.');
                }

                if (failure === 'abort') {
                    controller.abort(new Error('Atomic revision cancelled.'));
                }

                return failure === 'incomplete-receipts'
                    ? [{ id: proposalId }]
                    : [{ id: proposalId }, { id: randomUUID() }];
            });

            const provider = scriptedTutorModel([
                JSON.stringify({
                    kind: 'revise-blocks',
                    sourceBlockIds: [grammar.id, second.id],
                    instruction: 'Clarify both rules.',
                }),
                JSON.stringify({ proposals }),
            ]);
            const accounting = tutorAccountingFixture();
            const runner = createContextualTutorRunner({
                model: provider.model,
                accounting,
                maxInputTokens: 100_000,
            });
            const expectedFailure =
                failure === 'reject'
                    ? 'Atomic publication rejected'
                    : failure === 'abort'
                      ? 'Atomic revision cancelled'
                      : 'complete proposal set';

            await expect(runner.run(input)).rejects.toThrow(expectedFailure);

            expect(provider.requests).toHaveLength(2);
            expect(
                accounting.admit.mock.calls.map(([call]) => call.purpose),
            ).toEqual(['planning', 'authoring']);

            expect(input.onContentBatch).toHaveBeenCalledExactlyOnceWith(
                proposals.map(({ targetBlockId, blocks }) => ({
                    targetBlockId,
                    body: resultBody({ taskId: 'fixture', blocks }),
                })),
                expect.arrayContaining([expect.any(String)]),
            );

            expect(input.onContentProposal).not.toHaveBeenCalled();
            expect(input.onTool).not.toHaveBeenCalledWith(
                expect.objectContaining({ state: 'succeeded' }),
            );

            expect(input.onDelta).not.toHaveBeenCalled();
            expect(
                memory.state.get(tutorRequestStateKey)?.proposals ?? [],
            ).toEqual([]);
        },
    );

    it.each([
        { remainingCalls: 1, remainingOutputTokens: 10_000 },
        { remainingCalls: 4, remainingOutputTokens: 5_000 },
    ])(
        'declines a multi-call request before authoring when the parent budget cannot complete it: %j',
        async (remainingBudget) => {
            const { input } = fixture();
            const provider = scriptedTutorModel([JSON.stringify(shoppingPlan)]);
            const accounting = tutorAccountingFixture();
            const gate = createTutorModelGate({
                accounting,
                signal: input.signal,
                maxInputTokens: 100_000,
            });
            const agents = createTutorRequestAgents({
                planningModel: gate.wrap(provider.model, 'planning'),
                authoringModel: gate.wrap(provider.model, 'authoring'),
            });

            const result = await executeTutorRequest(
                input,
                agents,
                gate.signal,
                () => remainingBudget,
                { messages: [] },
            );

            expect(result).toHaveProperty('text');
            expect(provider.requests).toHaveLength(1);
            expect(
                accounting.admit.mock.calls.map(([call]) => call.purpose),
            ).toEqual(['planning']);

            expect(input.onContentProposal).not.toHaveBeenCalled();
        },
    );

    it('publishes no partial vocabulary when cancellation follows the first authored chunk', async () => {
        const { input } = fixture();
        const controller = new AbortController();
        input.signal = controller.signal;
        const provider = shoppingModel();
        const accounting = tutorAccountingFixture();
        accounting.settle.mockImplementation(async (call) => {
            if (call.purpose === 'authoring') {
                controller.abort(
                    new DOMException(
                        'Stopped between vocabulary chunks.',
                        'AbortError',
                    ),
                );
            }
        });

        await expect(
            createContextualTutorRunner({
                model: provider.model,
                accounting,
                maxInputTokens: 100_000,
            }).run(input),
        ).rejects.toThrow('Stopped between vocabulary chunks.');

        expect(provider.requests).toHaveLength(2);
        expect(input.onContentProposal).not.toHaveBeenCalled();
        expect(input.onResponseMetadata).not.toHaveBeenCalled();
    });

    it('forwards a reduced authoring output allowance through the real SDK dispatch', async () => {
        const { input } = fixture();
        const provider = scriptedTutorModel([
            JSON.stringify(plan),
            JSON.stringify(authored),
        ]);
        const accounting = tutorAccountingFixture();
        const gate = createTutorModelGate({
            accounting,
            signal: input.signal,
            maxInputTokens: 100_000,
        });
        const agents = createTutorRequestAgents({
            planningModel: gate.wrap(provider.model, 'planning'),
            authoringModel: gate.wrap(provider.model, 'authoring'),
        });

        await executeTutorRequest(
            input,
            agents,
            gate.signal,
            () => ({
                remainingCalls: 4,
                remainingOutputTokens: 3900,
            }),
            { messages: [] },
        );

        expect(provider.requests[1]?.maxOutputTokens).toBe(3900);
        expect(accounting.admit.mock.calls[1]?.[0].maxOutputTokens).toBe(3900);
        expect(input.onContentProposal).toHaveBeenCalledExactlyOnceWith({
            body: resultBody({ taskId: 'fixture', blocks: [grammar] }),
        });
    });

    it('keeps capability help conversational and removes both writing tools from its streamed answer', async () => {
        const { input } = fixture();
        input.message.content = 'What can you do?';
        const { provider, accounting, result } = await run(input, [
            JSON.stringify({
                kind: 'answer',
                purpose: 'conversation',
                documentUse: false,
            }),
            'I can explain language and help you practise.',
        ]);

        expect(result.text).toContain('explain language');
        expect(input.onResponseMetadata).toHaveBeenCalledWith({
            kind: 'conversation',
            documentUse: false,
        });

        expect(provider.requests[1]?.tools?.map((tool) => tool.name)).toEqual([
            'read_source_context',
            'recall',
        ]);

        expect(input.onContentProposal).not.toHaveBeenCalled();
        expect(
            accounting.admit.mock.calls.map(([call]) => call.purpose),
        ).toEqual(['planning', 'answer']);
    });

    it('requires a complete typed artifact and persists just one proposal without another actor call', async () => {
        const { input, memory } = fixture();
        const { provider, accounting } = await run(input, [
            JSON.stringify(plan),
            JSON.stringify(authored),
        ]);

        expect(input.onContentProposal).toHaveBeenCalledExactlyOnceWith(
            {
                body: resultBody({ taskId: 'fixture', blocks: [grammar] }),
            },
            expect.arrayContaining([expect.any(String)]),
        );

        expect(input.onResponseMetadata).toHaveBeenCalledWith({
            kind: 'generation',
            documentUse: false,
        });

        expect(provider.requests).toHaveLength(2);
        expect(
            accounting.admit.mock.calls.map(([call]) => call.purpose),
        ).toEqual(['planning', 'authoring']);

        expect(memory.state.get(tutorRequestStateKey)).toMatchObject({
            pending: null,
            proposals: [{ id: proposalId }],
        });
    });

    it('retains a pending complete brief across a clarification reply and later replaces it with a receipt', async () => {
        const { input, memory } = fixture();
        const incomplete = { ...task, language: undefined };
        await run(input, [
            JSON.stringify({
                kind: 'clarify',
                question: 'Which language?',
                brief: { tasks: [incomplete] },
            }),
        ]);

        expect(memory.state.get(tutorRequestStateKey)?.pending).toMatchObject({
            tasks: [{ id: 'grammar' }],
        });

        expect(input.onContentProposal).not.toHaveBeenCalled();
        input.message = {
            ...input.message,
            id: 'user-2',
            content: 'French.',
            createdAt: '2026-10-19T00:11:00.000Z',
        };

        memory.messages.set(input.message.id, input.message);
        const { provider } = await run(input, [
            JSON.stringify(plan),
            JSON.stringify(authored),
        ]);

        expect(JSON.stringify(provider.requests[0]?.prompt)).toContain(
            'pendingBrief',
        );

        expect(input.onContentProposal).toHaveBeenCalledTimes(1);
        expect(memory.state.get(tutorRequestStateKey)?.pending).toBeNull();
    });

    it('repairs one completed invalid artifact and fails without publishing if completeness remains invalid', async () => {
        const { input } = fixture();
        const provider = scriptedTutorModel([
            JSON.stringify(plan),
            JSON.stringify({ tasks: [{ taskId: 'wrong', blocks: [grammar] }] }),
            JSON.stringify({ tasks: [{ taskId: 'wrong', blocks: [grammar] }] }),
        ]);

        await expect(
            createContextualTutorRunner({
                model: provider.model,
                accounting: tutorAccountingFixture(),
                maxInputTokens: 100_000,
            }).run(input),
        ).rejects.toThrow('could not be generated');

        expect(provider.requests).toHaveLength(3);
        expect(input.onContentProposal).not.toHaveBeenCalled();
    });

    it('retrieves exact prior proposal content under server authority instead of using the summary as source', async () => {
        const { input, memory } = fixture();
        const vocabulary = {
            id: blockId,
            type: 'vocabulary' as const,
            language: 'fr',
            translationLanguage: 'en',
            entries: [
                {
                    id: '01900000-0000-4000-8000-000000000003',
                    term: 'chat',
                    translation: 'cat',
                },
            ],
        };

        await memory.port.writeState({
            [tutorRequestStateKey]: {
                pending: null,
                proposals: [
                    {
                        id: proposalId,
                        summary:
                            'A vocabulary proposal, deliberately without the exact words.',
                    },
                ],
            },
        });

        input.readContentProposal = vi.fn(async () => ({
            id: proposalId,
            body: resultBody({ taskId: 'fixture', blocks: [vocabulary] }),
        }));

        const exerciseTask = {
            id: 'practice',
            kind: 'exercises',
            instruction: 'Practise those words.',
            language: 'fr',
            count: 1,
            activities: [{ activityId: 'V01', count: 1 }],
        };
        const exercise = {
            ...namedExerciseFixture({
                activityId: 'V01',
                sources: [vocabulary],
            }),
            question: 'Translate cat into French.',
            explanation: 'Chat means cat.',
        };
        const { provider } = await run(input, [
            JSON.stringify({
                kind: 'generate',
                replyLanguage: 'en',
                sourceProposalIds: [proposalId],
                brief: { tasks: [exerciseTask] },
            }),
            JSON.stringify({
                tasks: [{ taskId: 'practice', blocks: [exercise] }],
            }),
        ]);

        expect(input.readContentProposal).toHaveBeenCalledWith(proposalId);

        expect(JSON.stringify(provider.requests[1]?.prompt)).toContain('chat');
        expect(input.onContentProposal).toHaveBeenCalledTimes(1);
    });

    it('generates Russian-guided six-word vocabulary then retrieves all exact words for typed follow-up exercises', async () => {
        const { input, memory } = fixture();
        const words = [
            'travail',
            'joie',
            'ménage',
            'carrelage',
            'poisson',
            'nourriture',
        ];
        const translations = [
            'работа',
            'радость',
            'уборка',
            'плитка',
            'рыба',
            'корм',
        ];
        const vocabulary = {
            id: blockId,
            type: 'vocabulary' as const,
            language: 'fr',
            translationLanguage: 'ru',
            entries: words.map((term, index) => ({
                id: randomUUID(),
                term,
                translation: translations[index]!,
            })),
        };
        const exerciseProposalId = randomUUID();
        const proposals = new Map<string, LearningBlock[]>();
        const exercises = words.map((word, index) => ({
            ...namedExerciseFixture({
                activityId: 'V01',
                sources: [
                    { ...vocabulary, entries: [vocabulary.entries[index]!] },
                ],
            }),
            question: `Как по-французски «${translations[index]}»?`,
            explanation: `«${word}» означает «${translations[index]}».`,
        }));

        input.message.content =
            'Сделай французский словарный блок с переводом на русский: travail — работа, joie — радость, ménage — уборка, carrelage — плитка, poisson — рыба, nourriture — корм.';

        input.onContentProposal = vi.fn(async (proposal) => {
            const id = proposals.size ? exerciseProposalId : proposalId;
            proposals.set(id, bodyBlocks(proposal.body));

            return { id };
        });

        input.readContentProposal = vi.fn(async (id) => {
            const blocks = proposals.get(id);

            if (!blocks) {
                throw new Error('Unavailable authorized proposal.');
            }

            return { id, body: resultBody({ taskId: 'fixture', blocks }) };
        });

        await run(input, [
            JSON.stringify({
                kind: 'generate',
                replyLanguage: 'ru',
                brief: {
                    tasks: [
                        {
                            id: 'vocabulary',
                            kind: 'vocabulary',
                            instruction:
                                'Создай словарь для указанных шести слов.',
                            language: 'fr',
                            translationLanguage: 'ru',
                            words,
                            count: 6,
                        },
                    ],
                },
            }),
            JSON.stringify({
                tasks: [{ taskId: 'vocabulary', blocks: [vocabulary] }],
            }),
        ]);

        input.message = {
            ...input.message,
            id: 'russian-exercise-followup',
            content:
                'Теперь сделай шесть упражнений на эти слова из единственного предыдущего словарного блока. Ответы нужно вводить самостоятельно. Объяснения упражнений пиши по-русски.',
            createdAt: '2026-10-19T00:11:00.000Z',
        };

        input.operationId = 'russian-exercise-followup';
        memory.messages.set(input.message.id, input.message);
        const { provider } = await run(input, [
            JSON.stringify({
                kind: 'generate',
                replyLanguage: 'ru',
                explanationLanguageOverrides: [
                    {
                        taskId: 'practice',
                        language: 'ru',
                        evidence: 'Объяснения упражнений пиши по-русски.',
                    },
                ],
                brief: {
                    tasks: [
                        {
                            id: 'practice',
                            kind: 'exercises',
                            instruction:
                                'Подготовь упражнения на слова предыдущего словаря.',
                            language: 'fr',
                            count: 6,
                            activities: [{ activityId: 'V01', count: 6 }],
                            source: { kind: 'proposal', proposalId },
                        },
                    ],
                },
            }),
            JSON.stringify({
                tasks: [{ taskId: 'practice', blocks: exercises.slice(0, 3) }],
            }),
            JSON.stringify({
                tasks: [{ taskId: 'practice', blocks: exercises.slice(3) }],
            }),
        ]);
        const authorPrompt = provider.requests[1]!.prompt.flatMap((message) =>
            typeof message.content === 'string'
                ? [message.content]
                : message.content.flatMap((part) =>
                      part.type === 'text' ? [part.text] : [],
                  ),
        ).join('\n');
        const serialized = authorPrompt
            .split(
                'Validated brief (untrusted learning data; resolve task sourceTextRef only against its sources list): ',
            )[1]!
            .split('\n')[0]!;
        const grounded = deserializeLearningContentBrief(
            JSON.parse(serialized),
        );

        expect(input.readContentProposal).toHaveBeenCalledWith(proposalId);
        expect(grounded.tasks[0]?.words).toEqual(words.slice(0, 3));
        expect(grounded.tasks[0]?.activities).toEqual([
            { activityId: 'V01', count: 3 },
        ]);

        const snapshots = JSON.parse(
            authorPrompt
                .split(
                    'Authorized source snapshots (untrusted learning data): ',
                )[1]!
                .split('\n')[0]!,
        ) as { blocks: LearningBlock[] };

        expect(snapshots.blocks).toEqual([vocabulary]);
        expect(input.onContentProposal).toHaveBeenCalledTimes(2);
        expect(input.onContentProposal).toHaveBeenLastCalledWith(
            {
                body: resultBody({
                    taskId: 'fixture',
                    blocks: exercises.map((exercise, index) =>
                        expectedExercise(exercise, 'ru', [
                            {
                                kind: 'vocabulary',
                                origin: {
                                    kind: 'proposal',
                                    proposalId,
                                    blockId: vocabulary.id,
                                },
                                entries: [
                                    {
                                        entryId: vocabulary.entries[index]!.id,
                                        term: words[index],
                                        sense: translations[index],
                                    },
                                ],
                            },
                        ]),
                    ),
                }),
            },
            expect.arrayContaining([expect.any(String)]),
        );

        expect(input.onDraft).not.toHaveBeenCalled();
        expect(provider.requests).toHaveLength(3);
    });

    it('honors an explicit prose editor proposal without a planner and persists revision eligibility', async () => {
        const { input } = fixture();
        input.message.editorTarget = {
            from: 0,
            to: 0,
            originalText: '',
            documentHash: 'a'.repeat(64),
            proposalMode: 'append',
        };

        const { accounting, result } = await run(input, [
            'A standalone French learning explanation.',
        ]);

        expect(result.text).toContain('standalone');
        expect(
            accounting.admit.mock.calls.map(([call]) => call.purpose),
        ).toEqual(['answer']);

        expect(input.onResponseMetadata).toHaveBeenCalledWith({
            kind: 'revision',
            documentUse: true,
        });

        expect(input.onContentProposal).not.toHaveBeenCalled();
    });

    it('preserves the five-call ceiling with two memory calls, planning and a host-grounded revision', async () => {
        const { input, memory } = fixture();
        const oldText =
            'Earlier examples of French grammar and articles. '.repeat(30);

        for (const [id, role] of [
            ['old-user', 'user'],
            ['old-answer', 'assistant'],
        ] as const) {
            memory.messages.set(id, {
                id,
                role,
                content: oldText,
                createdAt:
                    role === 'user'
                        ? '2026-10-19T00:01:00.000Z'
                        : '2026-10-19T00:02:00.000Z',
            });
        }

        input.sourceContext.referencedBlocks = [
            { id: blockId, type: 'grammar', title: 'Original grammar' },
        ];

        input.readContext = vi.fn(async () => ({
            material: [
                {
                    id: blockId,
                    label: 'Original grammar',
                    content: JSON.stringify(grammar),
                },
            ],
            total: 1,
        }));

        const observation =
            '<observations>\nThe learner studies French grammar. ' +
            'The learner wants clear examples. '.repeat(20) +
            '\n</observations>';
        const provider = scriptedTutorModel([
            observation,
            '<observations>French grammar.</observations>',
            JSON.stringify({
                kind: 'revise-blocks',
                sourceBlockIds: [blockId],
                instruction: 'Update the rule.',
            }),
            JSON.stringify({
                proposals: [
                    {
                        targetBlockId: blockId,
                        blocks: [
                            { ...grammar, rule: 'Updated prepared rule.' },
                        ],
                    },
                ],
            }),
        ]);
        const accounting = tutorAccountingFixture();
        await createContextualTutorRunner({
            model: provider.model,
            accounting,
            maxInputTokens: 100_000,
            memoryThresholds: {
                messageTokens: 100,
                observationTokens: 100,
                maxTokensPerBatch: 4000,
            },
        }).run(input);

        expect(
            accounting.admit.mock.calls.map(([call]) => call.purpose),
        ).toEqual(['observation', 'reflection', 'planning', 'authoring']);

        expect(input.readContext).toHaveBeenCalledExactlyOnceWith({
            query: 'Exact referenced learning blocks',
            limit: 10,
            blockIds: [blockId],
        });

        expect(
            provider.requests[3]?.tools?.map((tool) => tool.name) ?? [],
        ).not.toContain('read_source_context');

        expect(JSON.stringify(provider.requests[3]?.prompt)).toContain(
            grammar.rule,
        );

        expect(input.onContentProposal).toHaveBeenCalledTimes(1);
    });

    it('preserves exact prepared audio copy without granting arbitrary new media generation', async () => {
        const { input } = fixture();
        input.message.content = 'Copy the prepared audio block unchanged.';
        const audio = {
            id: blockId,
            type: 'audio',
            language: 'fr',
            assetId: '01900000-0000-4000-8000-000000000070',
            sourceText: 'Bonjour.',
        };

        input.readContext = vi.fn(async () => ({
            material: [
                {
                    id: blockId,
                    label: 'Prepared audio',
                    content: JSON.stringify(audio),
                },
            ],
            total: 1,
        }));

        const provider = scriptedTutorModel([
            JSON.stringify({ kind: 'copy', sourceBlockIds: [audio.id] }),
        ]);

        await createContextualTutorRunner({
            model: provider.model,
            accounting: tutorAccountingFixture(),
            maxInputTokens: 100_000,
        }).run(input);

        expect(input.onContentProposal).toHaveBeenCalledExactlyOnceWith({
            body: resultBody({ taskId: 'fixture', blocks: [audio] }),
        });

        expect(input.readContext).toHaveBeenCalledExactlyOnceWith({
            query: 'Exact referenced learning blocks',
            limit: 10,
            blockIds: [audio.id],
        });

        expect(provider.requests).toHaveLength(1);
    });

    it('copies every selected multimedia block directly from the authorized source', async () => {
        const { input } = fixture();
        const audio = {
            id: blockId,
            type: 'audio',
            language: 'fr',
            sourceText: 'Bonjour.',
        };
        const video = {
            id: '01900000-0000-4000-8000-000000000080',
            type: 'video',
            source: { kind: 'youtube', videoId: 'abcdefghijk' },
        };

        input.message.content = 'Copy both prepared blocks.';
        input.readContext = vi.fn(async () => ({
            material: [audio, video].map((block) => ({
                id: block.id,
                label: 'Prepared multimedia',
                content: JSON.stringify(block),
            })),
            total: 2,
        }));

        const { provider } = await run(input, [
            JSON.stringify({
                kind: 'copy',
                sourceBlockIds: [audio.id, video.id],
            }),
        ]);

        expect(input.onContentProposal).toHaveBeenCalledExactlyOnceWith({
            body: resultBody({ taskId: 'fixture', blocks: [audio, video] }),
        });

        expect(provider.requests).toHaveLength(1);
    });

    it('does not publish when an exact selected copy source is unavailable', async () => {
        const { input } = fixture();
        input.readContext = vi.fn(async () => ({ material: [], total: 0 }));
        await expect(
            run(input, [
                JSON.stringify({ kind: 'copy', sourceBlockIds: [blockId] }),
            ]),
        ).rejects.toThrow('unavailable');

        expect(input.onContentProposal).not.toHaveBeenCalled();
    });

    it('patches a multi-component pending brief without dropping unchanged tasks', async () => {
        const { input, memory } = fixture();
        const vocabulary = {
            id: 'vocabulary',
            kind: 'vocabulary',
            instruction: 'Prepare these words.',
            language: 'fr',
            words: ['chat'],
        };
        const practice = {
            id: 'practice',
            kind: 'exercises',
            instruction: 'Practise these words.',
            language: 'fr',
            words: ['chat'],
            count: 1,
            activities: [{ activityId: 'V01', count: 1 }],
            source: { kind: 'task', taskId: 'vocabulary' },
        };

        await memory.port.writeState({
            [tutorRequestStateKey]: {
                pending: { tasks: [vocabulary, task, practice] },
                proposals: [],
            },
        });

        const preparedVocabulary = {
            id: '01900000-0000-4000-8000-000000000090',
            type: 'vocabulary' as const,
            language: 'fr',
            translationLanguage: 'en',
            entries: [
                {
                    id: '01900000-0000-4000-8000-000000000091',
                    term: 'chat',
                    translation: 'cat',
                },
            ],
        };
        const exercise = {
            ...namedExerciseFixture({
                activityId: 'V01',
                sources: [preparedVocabulary],
            }),
            question: 'Translate cat.',
            explanation: 'Chat means cat.',
        };

        await run(input, [
            JSON.stringify({
                kind: 'generate',
                replyLanguage: 'en',
                continuesPending: true,
                brief: {
                    tasks: [
                        {
                            id: 'vocabulary',
                            kind: 'vocabulary',
                            instruction: 'Prepare these words.',
                            translationLanguage: 'en',
                        },
                    ],
                },
            }),
            JSON.stringify({
                tasks: [{ taskId: 'vocabulary', blocks: [preparedVocabulary] }],
            }),
            JSON.stringify({
                tasks: [{ taskId: 'grammar', blocks: [grammar] }],
            }),
            JSON.stringify({
                tasks: [{ taskId: 'practice', blocks: [exercise] }],
            }),
        ]);

        expect(input.onContentProposal).toHaveBeenCalledExactlyOnceWith(
            {
                body: resultBody({
                    taskId: 'fixture',
                    blocks: [
                        preparedVocabulary,
                        grammar,
                        expectedExercise(exercise, 'fr', [
                            {
                                kind: 'vocabulary',
                                origin: {
                                    kind: 'block',
                                    blockId: preparedVocabulary.id,
                                },
                                entries: [
                                    {
                                        entryId:
                                            preparedVocabulary.entries[0]!.id,
                                        term: 'chat',
                                        sense: 'cat',
                                    },
                                ],
                            },
                        ]),
                    ],
                }),
            },
            expect.arrayContaining([expect.any(String)]),
        );

        expect(memory.state.get(tutorRequestStateKey)?.pending).toBeNull();
    });

    it('keeps a near-limit older pending source out of a changed-editor plan and restores it exactly for authoring', async () => {
        const { input, memory } = fixture();
        input.sourceNote = {
            noteId: '01900000-0000-4000-8000-000000000094',
            noteVersion: 7,
        };

        const capturedOrigin = input.sourceNote;

        const passage =
            'BASIS_BEGIN' + 'La source originale. '.repeat(1_700) + 'BASIS_END';
        const practice = {
            id: 'practice',
            kind: 'exercises',
            instruction: 'Practise the source.',
            language: 'fr',
            source: { kind: 'editor' },
            sourceText: passage,
            count: 1,
            activities: [{ activityId: 'R04', count: 1 }],
        };
        const pending = {
            tasks: [
                { ...task, source: { kind: 'editor' }, sourceText: passage },
                practice,
            ],
        };
        const compact = JSON.parse(serializeLearningContentBrief(pending));
        const pendingState = {
            pending: compact,
            proposals: [],
            pendingSources: {
                blocks: [],
                tasks: [
                    {
                        taskId: 'practice',
                        blockIds: [],
                        selectionOrigin: capturedOrigin,
                    },
                ],
            },
        };

        input.sourceNote = { ...capturedOrigin, noteVersion: 8 };
        input.message = {
            ...input.message,
            content: 'French.',
            modelContent: projectTutorUserMessage({
                content: 'French.',
                editorContext: { content: 'CURRENT_EDITOR_REPLACEMENT' },
            }),
        };

        memory.messages.set(input.message.id, input.message);
        await memory.port.writeState({
            [tutorRequestStateKey]: pendingState,
        });

        expect(compact.sources).toHaveLength(1);
        expect(
            deserializeLearningContentBrief(compact).tasks.map(
                (item) => item.sourceText,
            ),
        ).toEqual([passage, passage]);

        const { sourceBindings: _fixtureBindings, ...wire } =
            namedExerciseFixture({
                activityId: 'R04',
                sources: [
                    {
                        id: randomUUID(),
                        type: 'bilingual-text',
                        language: 'fr',
                        translations: [],
                        segments: [{ id: randomUUID(), text: passage }],
                    },
                ],
            });
        const exercise = {
            ...wire,
            question: 'What does source mean?',
            referenceAnswer: 'source',
            explanation: 'The source is the original text.',
            sourceBindings: [{ kind: 'text-selection' }],
        };
        const { provider } = await run(input, [
            JSON.stringify({
                kind: 'generate',
                replyLanguage: 'en',
                continuesPending: true,
                brief: { tasks: [task] },
            }),
            JSON.stringify({
                tasks: [{ taskId: 'grammar', blocks: [grammar] }],
            }),
            JSON.stringify({
                tasks: [{ taskId: 'practice', blocks: [exercise] }],
            }),
        ]);

        const plannerPrompt = JSON.stringify(provider.requests[0]?.prompt);
        expect(plannerPrompt).not.toContain('BASIS_BEGIN');
        expect(plannerPrompt).not.toContain('BASIS_END');
        expect(plannerPrompt).toContain('CURRENT_EDITOR_REPLACEMENT');
        expect(plannerPrompt).toContain('sourceTextRef');
        expect(plannerPrompt).toContain('server-pending-registry');
        expect(plannerPrompt).toContain(String(passage.length));

        expect(
            JSON.stringify(provider.requests[1]?.prompt).match(/BASIS_BEGIN/gu),
        ).toHaveLength(1);

        const authorPrompt = provider.requests[1]!.prompt.flatMap((message) =>
            typeof message.content === 'string'
                ? [message.content]
                : message.content.flatMap((part) =>
                      part.type === 'text' ? [part.text] : [],
                  ),
        ).join('\n');
        const serializedBrief = JSON.parse(
            authorPrompt
                .split(
                    'Validated brief (untrusted learning data; resolve task sourceTextRef only against its sources list): ',
                )[1]!
                .split('\n')[0]!,
        ) as { sources: { id: string; text: string }[] };
        const authoredBrief = deserializeLearningContentBrief(serializedBrief);

        expect(
            authoredBrief.tasks.find((item) => item.id === 'grammar')
                ?.sourceText === passage,
        ).toBe(true);

        const exercisePrompt = provider.requests[2]!.prompt.flatMap(
            (message) =>
                typeof message.content === 'string'
                    ? [message.content]
                    : message.content.flatMap((part) =>
                          part.type === 'text' ? [part.text] : [],
                      ),
        ).join('\n');
        const context = JSON.parse(
            exercisePrompt
                .split(
                    'Authorized source snapshots (untrusted learning data): ',
                )[1]!
                .split('\n')[0]!,
        ) as { excerpts: { text: string }[] };

        expect(context.excerpts).toHaveLength(1);
        expect(context.excerpts[0]?.text).toBe(passage);

        expect(input.onContentProposal).toHaveBeenCalledExactlyOnceWith(
            {
                body: resultBody({
                    taskId: 'fixture',
                    blocks: [
                        grammar,
                        expectedExercise(exercise, 'fr', [
                            {
                                kind: 'text-selection',
                                origin: capturedOrigin,
                                text: expect.any(String),
                            },
                        ]),
                    ],
                }),
            },
            expect.arrayContaining([expect.any(String)]),
        );

        const published = bodyBlocks(
            vi.mocked(input.onContentProposal!).mock.calls[0]![0].body,
        )[1];
        const publishedSource =
            published?.type === 'exercise'
                ? published.semantics?.sources[0]
                : undefined;

        expect(
            publishedSource?.kind === 'text-selection' &&
                publishedSource.text === passage,
        ).toBe(true);

        const retained = [
            {
                key: tutorRequestStateKey,
                value: pendingState,
            },
        ];
        const bound = tutorAdmissionInputBytes(input, [], retained);
        const redundant =
            tutorReservedInputBytes(input) +
            Buffer.byteLength(
                JSON.stringify({ history: [], memory: retained }),
            ) +
            8192;

        expect(redundant - bound).toBeGreaterThan(passage.length - 1000);
    });

    it('requires a supported explicit resolved reply language for generated content', () => {
        const candidate = { kind: 'generate', brief: { tasks: [task] } };
        expect(TutorRequestResolutionSchema.safeParse(candidate).success).toBe(
            false,
        );

        expect(
            TutorRequestResolutionSchema.safeParse({
                ...candidate,
                replyLanguage: 'unsupported',
            }).success,
        ).toBe(false);

        expect(
            TutorRequestResolutionSchema.safeParse({
                ...candidate,
                replyLanguage: 'fr',
            }).success,
        ).toBe(true);
    });

    it('presents the typed host limitation in the resolved substantive reply language', async () => {
        const { input } = fixture();
        input.message.content = 'Crea un ejercicio de dictado en español.';
        const { result, provider } = await run(input, [
            JSON.stringify({
                kind: 'generate',
                replyLanguage: 'es',
                brief: {
                    tasks: [
                        {
                            id: 'practice',
                            kind: 'exercises',
                            instruction: 'Create dictation.',
                            language: 'es',
                            count: 1,
                            formats: ['dictation'],
                        },
                    ],
                },
            }),
        ]);

        expect(result.text).toContain('opción múltiple');
        expect(result.text).toContain('huecos');
        expect(result.text).toContain('respuesta libre');
        expect(provider.requests).toHaveLength(1);
        expect(input.onContentProposal).not.toHaveBeenCalled();
    });

    it('forwards explicit explanation preferences independently of the studied and resolver languages', async () => {
        const { input } = fixture();
        input.preferences = {
            ...input.preferences,
            replyLanguage: 'ru',
            detail: 'concise',
            wording: 'simple',
            approach: 'examples-first',
        };

        const { provider } = await run(input, [
            JSON.stringify({ ...plan, replyLanguage: 'en' }),
            JSON.stringify(authored),
        ]);
        const request = provider.requests[1]!.prompt.flatMap((message) =>
            typeof message.content === 'string'
                ? [message.content]
                : message.content.flatMap((part) =>
                      part.type === 'text' ? [part.text] : [],
                  ),
        ).join('\n');
        const frame = request
            .split(
                'Application authoring preferences (trusted server-validated settings): ',
            )[1]!
            .split('\n')[0]!;

        expect(JSON.parse(frame)).toMatchObject({
            explanationLanguage: 'ru',
            detail: 'concise',
            wording: 'simple',
            approach: 'examples-first',
        });

        expect(request).toContain('translation language unchanged');
        expect(input.onContentProposal).toHaveBeenCalledExactlyOnceWith(
            {
                body: resultBody({ taskId: 'fixture', blocks: [grammar] }),
            },
            expect.arrayContaining([expect.any(String)]),
        );
    });

    it.each([
        'catalog-target',
        'unknown-target',
        'outside-explicit-selection',
    ] as const)(
        'fences natural no-chip revisions to frozen source authority: %s',
        async (selection) => {
            const { input } = fixture();
            const unknownId = '01900000-0000-4000-8000-000000000099';
            input.message.content =
                'Update the French grammar block, preserving its identity.';

            input.sourceContext.availableBlocks = [
                { id: blockId, type: 'grammar', title: 'French grammar' },
            ];

            if (selection === 'outside-explicit-selection') {
                input.sourceContext.referencedBlocks = [
                    {
                        id: unknownId,
                        type: 'grammar',
                        title: 'A different explicitly selected block',
                    },
                ];
            }

            input.readContext = vi.fn(async () => ({
                material: [
                    {
                        id: blockId,
                        label: 'French grammar',
                        content: JSON.stringify(grammar),
                    },
                ],
                total: 1,
            }));

            const targetBlockId =
                selection === 'unknown-target' ? unknownId : blockId;
            const revised = { ...grammar, rule: 'A clearer prepared rule.' };
            const provider = scriptedTutorModel([
                JSON.stringify({
                    kind: 'revise',
                    replyLanguage: 'en',
                    targetBlockId,
                    brief: { tasks: [task] },
                }),
                JSON.stringify({
                    proposals: [{ targetBlockId, blocks: [revised] }],
                }),
            ]);
            const pending = createContextualTutorRunner({
                model: provider.model,
                accounting: tutorAccountingFixture(),
                maxInputTokens: 100_000,
            }).run(input);

            if (selection === 'catalog-target') {
                await pending;
                expect(input.readContext).toHaveBeenCalledExactlyOnceWith({
                    query: 'Exact referenced learning blocks',
                    limit: 10,
                    blockIds: [blockId],
                });

                expect(input.onContentProposal).toHaveBeenCalledExactlyOnceWith(
                    {
                        targetBlockId: blockId,
                        body: resultBody({
                            taskId: 'fixture',
                            blocks: [revised],
                        }),
                    },
                    expect.arrayContaining([expect.any(String)]),
                );

                expect(JSON.stringify(provider.requests[1]?.prompt)).toContain(
                    grammar.rule,
                );
            } else {
                await expect(pending).rejects.toThrow(
                    'authorized frozen source',
                );

                expect(input.readContext).not.toHaveBeenCalled();
                expect(input.onContentProposal).not.toHaveBeenCalled();
            }
        },
    );
});
