import { projectTutorUserMessage } from '../../application/tutor-message-context';
import type { LearningBlock } from '@languon/contracts';
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
        expect(input.onBlockProposal).toHaveBeenCalledOnce();
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
        expect(input.onBlockProposal).toHaveBeenCalledOnce();
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

        expect(input.onBlockProposal).toHaveBeenCalledOnce();
        const proposal = vi.mocked(input.onBlockProposal!).mock.calls[0]![0];
        expect(proposal.blocks).toHaveLength(1);
        const block = proposal.blocks[0]!;
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
        const { accounting } = await run(input, [
            JSON.stringify(plan),
            JSON.stringify(wrongKind),
            JSON.stringify(authored),
        ]);

        expect(
            accounting.admit.mock.calls.map(([call]) => call.purpose),
        ).toEqual(['planning', 'authoring', 'authoring']);

        expect(input.onBlockProposal).toHaveBeenCalledExactlyOnceWith({
            blocks: [grammar],
        });
    });

    it('normalizes unchanged vocabulary identities before publishing a canonical revision', async () => {
        const { input } = fixture();
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
        expect(input.onBlockProposal).toHaveBeenCalledExactlyOnceWith({
            targetBlockId: blockId,
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
        });
    });

    it('validates the entire canonical revision set before any proposal publication', async () => {
        const { input } = fixture();
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
        expect(input.onBlockProposal).toHaveBeenCalledTimes(2);
        expect(input.onBlockProposal).toHaveBeenNthCalledWith(1, first);
        expect(input.onBlockProposal).toHaveBeenNthCalledWith(2, last);
    });

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

            expect(input.onBlockProposal).not.toHaveBeenCalled();
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
        expect(input.onBlockProposal).not.toHaveBeenCalled();
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
        expect(input.onBlockProposal).toHaveBeenCalledExactlyOnceWith({
            blocks: [grammar],
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
        const groupId = randomUUID();
        const exercises = words.map((word, index) => ({
            id: randomUUID(),
            type: 'exercise' as const,
            format: 'free-text' as const,
            question: `Как по-французски «${translations[index]}»?`,
            referenceAnswer: word,
            explanation: `«${word}» означает «${translations[index]}».`,
            group: { id: groupId, title: 'Практика шести слов' },
        }));

        input.message.content =
            'Сделай французский словарный блок с переводом на русский: travail — работа, joie — радость, ménage — уборка, carrelage — плитка, poisson — рыба, nourriture — корм.';

        input.onBlockProposal = vi.fn(async (proposal) => {
            const id = proposals.size ? exerciseProposalId : proposalId;
            proposals.set(id, proposal.blocks);

            return { id };
        });

        input.readBlockProposal = vi.fn(async (id) => {
            const blocks = proposals.get(id);

            if (!blocks) {
                throw new Error('Unavailable authorized proposal.');
            }

            return { id, blocks };
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
                'Теперь сделай шесть упражнений на эти слова из единственного предыдущего словарного блока. Ответы нужно вводить самостоятельно.',
            createdAt: '2026-10-19T00:11:00.000Z',
        };

        input.operationId = 'russian-exercise-followup';
        memory.messages.set(input.message.id, input.message);
        const { provider } = await run(input, [
            JSON.stringify({
                kind: 'generate',
                replyLanguage: 'ru',
                brief: {
                    tasks: [
                        {
                            id: 'practice',
                            kind: 'exercises',
                            instruction:
                                'Подготовь упражнения на слова предыдущего словаря.',
                            language: 'fr',
                            count: 6,
                            formats: ['free-text'],
                            source: { kind: 'proposal', proposalId },
                        },
                    ],
                },
            }),
            JSON.stringify({
                tasks: [{ taskId: 'practice', blocks: exercises }],
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

        expect(input.readBlockProposal).toHaveBeenCalledWith(proposalId);
        expect(grounded.tasks[0]?.words).toEqual(words);
        expect(grounded.tasks[0]?.sourceText).toBe(words.join('\n'));
        expect(input.onBlockProposal).toHaveBeenCalledTimes(2);
        expect(input.onBlockProposal).toHaveBeenLastCalledWith({
            blocks: exercises,
        });

        expect(input.onDraft).not.toHaveBeenCalled();
        expect(provider.requests).toHaveLength(2);
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
            JSON.stringify({ kind: 'copy', sourceBlockIds: [audio.id] }),
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

        expect(input.onBlockProposal).toHaveBeenCalledExactlyOnceWith({
            blocks: [audio, video],
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

        expect(input.onBlockProposal).not.toHaveBeenCalled();
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

    it('keeps a near-limit older pending source out of a changed-editor plan and restores it exactly for authoring', async () => {
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
                editorContext: { content: 'CURRENT_EDITOR_REPLACEMENT' },
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
        const authoredBrief = deserializeLearningContentBrief(
            JSON.parse(
                authorPrompt
                    .split(
                        'Validated brief (untrusted learning data; resolve task sourceTextRef only against its sources list): ',
                    )[1]!
                    .split('\n')[0]!,
            ),
        );

        expect(authoredBrief.tasks.map((item) => item.sourceText)).toEqual([
            passage,
            passage,
        ]);

        expect(input.onBlockProposal).toHaveBeenCalledExactlyOnceWith({
            blocks: [grammar, exercise],
        });

        const retained = [
            {
                key: tutorRequestStateKey,
                value: { pending: compact, proposals: [] },
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
