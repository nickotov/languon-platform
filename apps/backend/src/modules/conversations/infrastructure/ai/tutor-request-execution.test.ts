import { projectTutorUserMessage } from '../../application/tutor-message-context';
import {
    serializeLearningContentBrief,
    deserializeLearningContentBrief,
} from '../../application/learning-content-transport';
import {
    tutorAdmissionInputBytes,
    tutorReservedInputBytes,
} from '../../application/tutor-context-budget';
import { describe, expect, it, vi } from 'vitest';
import type { TutorRunInput } from '../../application/ports/tutor-runner';
import {
    TutorRequestResolutionSchema,
    tutorRequestStateKey,
} from '../../application/tutor-request-contract';
import { createContextualTutorRunner } from './contextual-tutor-runner';
import {
    scriptedTutorModel,
    tutorAccountingFixture,
    tutorMemoryFixture,
} from './tutor-test-fixtures';

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
        onBlockProposal: vi.fn(async () => ({ id: proposalId })),
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

        expect(input.onBlockProposal).not.toHaveBeenCalled();
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

        expect(input.onBlockProposal).toHaveBeenCalledExactlyOnceWith({
            blocks: [grammar],
        });

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

        expect(input.onBlockProposal).not.toHaveBeenCalled();
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

        expect(input.onBlockProposal).toHaveBeenCalledTimes(1);
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
        expect(input.onBlockProposal).not.toHaveBeenCalled();
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

        input.readBlockProposal = vi.fn(async () => ({
            id: proposalId,
            blocks: [vocabulary],
        }));

        const exerciseTask = {
            id: 'practice',
            kind: 'exercises',
            instruction: 'Practise those words.',
            language: 'fr',
            count: 1,
            formats: ['free-text'],
        };
        const exercise = {
            id: '01900000-0000-4000-8000-000000000004',
            type: 'exercise',
            format: 'free-text',
            question: 'Translate cat into French.',
            referenceAnswer: 'chat',
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

        expect(input.readBlockProposal).toHaveBeenCalledWith(proposalId);

        expect(JSON.stringify(provider.requests[1]?.prompt)).toContain('chat');
        expect(input.onBlockProposal).toHaveBeenCalledTimes(1);
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

        expect(input.onBlockProposal).not.toHaveBeenCalled();
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
            JSON.stringify({ kind: 'legacy-revision' }),
            {
                toolName: 'propose_learning_blocks',
                input: {
                    targetBlockId: blockId,
                    blocks: [{ ...grammar, rule: 'Updated prepared rule.' }],
                },
            },
            'Review the updated proposal.',
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
        ).toEqual([
            'observation',
            'reflection',
            'planning',
            'answer',
            'answer',
        ]);

        expect(input.readContext).toHaveBeenCalledExactlyOnceWith({
            query: 'Exact referenced learning blocks',
            limit: 10,
            blockIds: [blockId],
        });

        expect(
            provider.requests[3]?.tools?.map((tool) => tool.name),
        ).not.toContain('read_source_context');

        expect(JSON.stringify(provider.requests[3]?.prompt)).toContain(
            grammar.rule,
        );

        expect(input.onBlockProposal).toHaveBeenCalledTimes(1);
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
            JSON.stringify({ kind: 'legacy-copy', sourceBlockIds: [audio.id] }),
            { toolName: 'propose_learning_blocks', input: { blocks: [audio] } },
            'Review the copied audio proposal.',
        ]);

        await createContextualTutorRunner({
            model: provider.model,
            accounting: tutorAccountingFixture(),
            maxInputTokens: 100_000,
        }).run(input);

        expect(input.onBlockProposal).toHaveBeenCalledExactlyOnceWith({
            blocks: [audio],
        });

        expect(input.readContext).toHaveBeenCalledExactlyOnceWith({
            query: 'Exact referenced learning blocks',
            limit: 10,
            blockIds: [audio.id],
        });

        expect(
            provider.requests[1]?.tools?.map((tool) => tool.name),
        ).not.toContain('read_source_context');
    });

    it.each(['complete', 'missing', 'duplicate'] as const)(
        'matches the complete multimedia copy set one-to-one: %s',
        async (candidate) => {
            const { input } = fixture();
            input.message.content =
                'Copy both the prepared audio and video blocks.';

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

            input.readContext = vi.fn(async () => ({
                material: [audio, video].map((block) => ({
                    id: block.id,
                    label: 'Prepared multimedia',
                    content: JSON.stringify(block),
                })),
                total: 2,
            }));

            const blocks =
                candidate === 'complete'
                    ? [audio, video]
                    : candidate === 'missing'
                      ? [audio]
                      : [audio, audio];
            const provider = scriptedTutorModel([
                JSON.stringify({
                    kind: 'legacy-copy',
                    sourceBlockIds: [audio.id, video.id],
                }),
                { toolName: 'propose_learning_blocks', input: { blocks } },
                'Review the multimedia copy.',
            ]);
            const result = createContextualTutorRunner({
                model: provider.model,
                accounting: tutorAccountingFixture(),
                maxInputTokens: 100_000,
            }).run(input);

            if (candidate === 'complete') {
                await result;
                expect(input.onBlockProposal).toHaveBeenCalledExactlyOnceWith({
                    blocks: [audio, video],
                });
            } else {
                await expect(result).rejects.toThrow('were not completed');
                expect(input.onBlockProposal).not.toHaveBeenCalled();
            }
        },
    );

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
            formats: ['free-text'],
        };

        await memory.port.writeState({
            [tutorRequestStateKey]: {
                pending: { tasks: [vocabulary, task, practice] },
                proposals: [],
            },
        });

        const preparedVocabulary = {
            id: '01900000-0000-4000-8000-000000000090',
            type: 'vocabulary',
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
            id: '01900000-0000-4000-8000-000000000092',
            type: 'exercise',
            format: 'free-text',
            question: 'Translate cat.',
            referenceAnswer: 'chat',
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
                tasks: [
                    { taskId: 'vocabulary', blocks: [preparedVocabulary] },
                    { taskId: 'grammar', blocks: [grammar] },
                    { taskId: 'practice', blocks: [exercise] },
                ],
            }),
        ]);

        expect(input.onBlockProposal).toHaveBeenCalledExactlyOnceWith({
            blocks: [preparedVocabulary, grammar, exercise],
        });

        expect(memory.state.get(tutorRequestStateKey)?.pending).toBeNull();
    });

    it('stores and sends one near-limit frozen source for a mixed pending continuation', async () => {
        const { input, memory } = fixture();
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
            formats: ['free-text'],
        };
        const pending = {
            tasks: [
                { ...task, source: { kind: 'editor' }, sourceText: passage },
                practice,
            ],
        };
        const compact = JSON.parse(serializeLearningContentBrief(pending));
        input.message = {
            ...input.message,
            content: 'French.',
            modelContent: projectTutorUserMessage({
                content: 'French.',
                editorContext: { content: passage },
            }),
        };

        memory.messages.set(input.message.id, input.message);
        await memory.port.writeState({
            [tutorRequestStateKey]: { pending: compact, proposals: [] },
        });

        expect(compact.sources).toHaveLength(1);
        expect(
            deserializeLearningContentBrief(compact).tasks.map(
                (item) => item.sourceText,
            ),
        ).toEqual([passage, passage]);

        const exercise = {
            id: '01900000-0000-4000-8000-000000000093',
            type: 'exercise',
            format: 'free-text',
            question: 'What does source mean?',
            referenceAnswer: 'source',
            explanation: 'The source is the original text.',
        };
        const { provider } = await run(input, [
            '<observations>The current source is retained by the host.</observations>',
            JSON.stringify({
                kind: 'generate',
                replyLanguage: 'en',
                continuesPending: true,
                brief: { tasks: [task] },
            }),
            JSON.stringify({
                tasks: [
                    { taskId: 'grammar', blocks: [grammar] },
                    { taskId: 'practice', blocks: [exercise] },
                ],
            }),
        ]);

        expect(
            JSON.stringify(provider.requests[1]?.prompt).match(/BASIS_BEGIN/gu),
        ).toHaveLength(1);

        expect(
            JSON.stringify(provider.requests[2]?.prompt).match(/BASIS_BEGIN/gu),
        ).toHaveLength(1);

        const retained = [{ value: { pending: compact, proposals: [] } }];
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
        expect(input.onBlockProposal).not.toHaveBeenCalled();
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
        expect(input.onBlockProposal).toHaveBeenCalledExactlyOnceWith({
            blocks: [grammar],
        });
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
                {
                    toolName: 'propose_learning_blocks',
                    input: { targetBlockId, blocks: [revised] },
                },
                'Review the grammar update.',
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

                expect(input.onBlockProposal).toHaveBeenCalledExactlyOnceWith({
                    targetBlockId: blockId,
                    blocks: [revised],
                });

                expect(JSON.stringify(provider.requests[1]?.prompt)).toContain(
                    grammar.rule,
                );
            } else {
                await expect(pending).rejects.toThrow(
                    'authorized frozen source',
                );

                expect(input.readContext).not.toHaveBeenCalled();
                expect(input.onBlockProposal).not.toHaveBeenCalled();
            }
        },
    );
});
