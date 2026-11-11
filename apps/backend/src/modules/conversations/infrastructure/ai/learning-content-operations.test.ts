import { describe, expect, it, vi } from 'vitest';
import type { LearningContentResult } from '../../application/learning-content-contract';
import { createLearningContentOperations } from './learning-content-operations';
import { Agent } from '@mastra/core/agent';
import { createCanonicalMastra } from '../../../../mastra/composition';
import { createLearningContentTools } from './learning-content-tools';
import { createContextualTutorTools } from './contextual-tutor-tools';
import { scriptedTutorModel } from './tutor-test-fixtures';
import { tutorMemoryFixture } from './tutor-test-fixtures';
import { resolveLearningToolSources } from './learning-content-tools';
import { projectTutorUserMessage } from '../../application/tutor-message-context';

const proposalId = '01900000-0000-4000-8000-000000000001';
const blockId = '01900000-0000-4000-8000-000000000002';
const brief = {
    tasks: [
        {
            id: 'grammar',
            kind: 'grammar',
            language: 'fr',
            instruction: 'Explain the compound past.',
        },
    ],
};
const ready: LearningContentResult = {
    status: 'ready',
    proposal: {
        blocks: [
            {
                id: blockId,
                type: 'grammar',
                language: 'fr',
                rule: 'Use avoir with the past participle.',
            },
        ],
    },
    summary: 'One grammar block.',
};

describe('canonical learning generation and proposal publication', () => {
    it('requires host resolution for descriptor sources even when supplied text looks complete', async () => {
        const generate = vi.fn(async () => ready);
        const publish = vi.fn();
        const operation = createLearningContentOperations({
            authoring: { generate },
            publish,
            signal: new AbortController().signal,
        });

        await expect(
            operation.generateAndPropose({
                tasks: [
                    {
                        ...brief.tasks[0],
                        source: { kind: 'editor' },
                        sourceText: 'Invented source.',
                    },
                ],
            }),
        ).resolves.toMatchObject({
            status: 'needs-clarification',
            missing: [{ fields: ['sourceText'] }],
        });

        expect(generate).not.toHaveBeenCalled();
        expect(publish).not.toHaveBeenCalled();
    });

    it('replaces source-bearing caller text with the authorized frozen editor source', async () => {
        const generate = vi.fn(async (_brief: unknown) => ready);
        const publish = vi.fn(async () => ({ id: proposalId }));
        const memory = tutorMemoryFixture();
        const operation = createLearningContentOperations({
            authoring: { generate },
            publish,
            signal: new AbortController().signal,
            resolveSources: (candidate) =>
                resolveLearningToolSources(
                    {
                        memory: memory.port,
                        message: {
                            id: 'source',
                            role: 'user',
                            content: 'Explain this.',
                            createdAt: new Date().toISOString(),
                            modelContent: projectTutorUserMessage({
                                content: 'Explain this.',
                                editorContext: {
                                    content: 'Exact authorized passage.',
                                },
                            }),
                        },
                    },
                    candidate,
                ),
        });

        await operation.generateAndPropose({
            tasks: [
                {
                    ...brief.tasks[0],
                    source: { kind: 'editor' },
                    sourceText: 'Invented source.',
                },
            ],
        });

        expect(generate.mock.calls[0]?.[0]).toMatchObject({
            tasks: [{ sourceText: 'Exact authorized passage.' }],
        });

        expect(JSON.stringify(generate.mock.calls)).not.toContain(
            'Invented source.',
        );

        expect(publish).toHaveBeenCalledOnce();
    });

    it('refuses a proposal outside the authorized recent catalog before retrieval or authoring', async () => {
        const generate = vi.fn(async () => ready);
        const publish = vi.fn();
        const readBlockProposal = vi.fn();
        const memory = tutorMemoryFixture();
        const operation = createLearningContentOperations({
            authoring: { generate },
            publish,
            signal: new AbortController().signal,
            resolveSources: (candidate) =>
                resolveLearningToolSources(
                    {
                        memory: memory.port,
                        readBlockProposal,
                        message: {
                            id: 'source',
                            role: 'user',
                            content: 'Explain this.',
                            createdAt: new Date().toISOString(),
                        },
                    },
                    candidate,
                ),
        });

        await expect(
            operation.generateAndPropose({
                tasks: [
                    {
                        ...brief.tasks[0],
                        source: { kind: 'proposal', proposalId },
                        sourceText: 'Invented source.',
                    },
                ],
            }),
        ).resolves.toMatchObject({ status: 'needs-clarification' });

        expect(readBlockProposal).not.toHaveBeenCalled();
        expect(generate).not.toHaveBeenCalled();
        expect(publish).not.toHaveBeenCalled();
    });

    it('keeps model-output projection in canonical Mastra registration', () => {
        const tools = createLearningContentTools({
            signal: new AbortController().signal,
            generate: vi.fn(),
            publish: async () => ({ id: proposalId }),
        });
        const runtime = createCanonicalMastra({
            contextualTutor: {
                agent: new Agent({
                    id: 'synthetic',
                    name: 'Synthetic',
                    instructions: 'Synthetic.',
                    model: scriptedTutorModel([]).model,
                }),
                tools: createContextualTutorTools({
                    signal: new AbortController().signal,
                    readContext: async () => ({ material: [], total: 0 }),
                    onDraft: async () => ({ id: proposalId }),
                }),
                learningContentTools: tools,
            },
        });
        const registered = runtime.listTools()?.generate_grammar;

        expect(registered?.toModelOutput).toBe(
            tools.generate_grammar.toModelOutput,
        );
    });

    it('publishes once for concurrent identical invocations and exposes only a compact receipt', async () => {
        const generate = vi.fn(async () => ready);
        const publish = vi.fn(async () => ({ id: proposalId }));
        const onTool = vi.fn();
        const operation = createLearningContentOperations({
            authoring: { generate },
            publish,
            onTool,
            signal: new AbortController().signal,
        });

        const [first, repeated] = await Promise.all([
            operation.generateAndPropose(brief),
            operation.generateAndPropose(brief),
        ]);

        expect(first).toEqual(repeated);
        expect(generate).toHaveBeenCalledOnce();
        expect(publish).toHaveBeenCalledExactlyOnceWith(ready.proposal);
        expect(first).toEqual({
            status: 'ready',
            receipt: {
                proposalId,
                summary: ready.summary,
                content: [{ kind: 'grammar', count: 1, language: 'fr' }],
                requiresLearnerApply: true,
            },
        });

        expect(JSON.stringify(first)).not.toContain('past participle');
        expect(onTool.mock.calls.map(([call]) => call.state)).toEqual([
            'running',
            'succeeded',
        ]);
    });

    it('does not publish unsupported/incomplete material', async () => {
        const generate = vi.fn(async (): Promise<LearningContentResult> => ({
            status: 'needs-clarification',
            missing: [{ taskId: 'grammar', fields: ['language'] }],
        }));
        const publish = vi.fn();
        const operation = createLearningContentOperations({
            authoring: { generate },
            publish,
            signal: new AbortController().signal,
        });

        await expect(
            operation.generateAndPropose(brief),
        ).resolves.toMatchObject({ status: 'needs-clarification' });

        expect(publish).not.toHaveBeenCalled();
    });

    it('retains uncertain publication failure and never redispatches authoring or the write', async () => {
        const generate = vi.fn(async () => ready);
        const publish = vi.fn(async () => {
            throw new Error('Unknown publication outcome.');
        });
        const operation = createLearningContentOperations({
            authoring: { generate },
            publish,
            signal: new AbortController().signal,
        });

        await expect(operation.generateAndPropose(brief)).rejects.toThrow(
            'Unknown publication',
        );

        await expect(operation.generateAndPropose(brief)).rejects.toThrow(
            'Unknown publication',
        );

        expect(generate).toHaveBeenCalledOnce();
        expect(publish).toHaveBeenCalledOnce();
    });

    it('does not publish after cancellation following authoring', async () => {
        const controller = new AbortController();
        const generate = vi.fn(async () => {
            controller.abort();

            return ready;
        });
        const publish = vi.fn();
        const operation = createLearningContentOperations({
            authoring: { generate },
            publish,
            signal: controller.signal,
        });

        await expect(operation.generateAndPropose(brief)).rejects.toThrow();
        expect(publish).not.toHaveBeenCalled();
    });
});
