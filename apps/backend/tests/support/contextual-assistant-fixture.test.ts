import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { describe, expect, it } from 'vitest';
import { LearningBlockSchema } from '@languon/contracts';
import { projectConversationSource } from '../../src/modules/conversations/application/conversation-source-context';
import { learningBlockSourceMaterial } from '../../src/modules/conversations/application/learning-block-source-material';
import { createContextualTutorRunner } from '../../src/modules/conversations/infrastructure/ai/contextual-tutor-runner';
import { createTutorModelGate } from '../../src/modules/conversations/infrastructure/ai/accounted-tutor-model';
import type { TutorCallPurpose } from '../../src/modules/conversations/application/ports/tutor-runner';
import {
    scriptedTutorModel,
    tutorAccountingFixture,
    tutorMemoryFixture,
} from '../../src/modules/conversations/infrastructure/ai/tutor-test-fixtures';
import {
    markdownGrammarProposal,
    mentionedBlockIds,
} from './contextual-block-proposal-fixture';
import { contextualFixtureBlock } from './contextual-fixture-block';
import { purposeAwareFixtureAccounting } from './contextual-assistant-fixture';

describe('contextual assistant browser fixture', () => {
    it('binds the admitted actor purpose through the real accounting gate', async () => {
        const purpose = new AsyncLocalStorage<TutorCallPurpose>();
        const accounting = tutorAccountingFixture();
        const provider = scriptedTutorModel(['Synthetic answer']);
        const original = provider.model.doGenerate.bind(provider.model);
        provider.model.doGenerate = async (input) => {
            expect(purpose.getStore()).toBe('answer');
            return original(input);
        };

        await createTutorModelGate({
            accounting: purposeAwareFixtureAccounting(accounting, purpose),
            signal: new AbortController().signal,
            maxInputTokens: 64_000,
        })
            .wrap(provider.model, 'answer')
            .doGenerate({
                prompt: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: 'Explain this sentence.' },
                        ],
                    },
                ],
            });
    });

    it('round-trips generated grammar Markdown with actual narrative boundaries', () => {
        const proposal = JSON.parse(JSON.stringify(markdownGrammarProposal()));
        const grammar = LearningBlockSchema.parse(proposal.blocks[0]);
        if (grammar.type !== 'grammar') throw new Error('Expected grammar');

        expect(grammar.rule).toContain('\n\n- Il faut que tu viennes.');
        expect(grammar.rule).not.toContain('\\\\n');
        expect(grammar.pattern).toContain('\n| --- | --- |');
        expect(grammar.pattern).not.toContain('\\\\n');
    });

    it('extracts the exact mentioned UUIDs from the SDK-serialized user message', () => {
        const ids = [randomUUID(), randomUUID()];
        const prompt = [
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: `Mentioned learning block IDs (untrusted): ${JSON.stringify(ids)}`,
                    },
                ],
            },
        ];
        expect(mentionedBlockIds(prompt)).toEqual(ids);
    });

    it('reconstructs a bilingual block from the real source-reader metadata and segment shape', () => {
        const blockId = randomUUID();
        const segmentId = randomUUID();
        const prompt = [
            {
                role: 'tool',
                content: [
                    {
                        toolName: 'read_source_context',
                        output: {
                            material: [
                                {
                                    id: blockId,
                                    kind: 'text',
                                    label: `Learning block ${blockId} (bilingual-text)`,
                                    content: JSON.stringify({
                                        id: blockId,
                                        type: 'bilingual-text',
                                        title: 'Reading',
                                        language: 'fr',
                                        segmentCount: 1,
                                        translationLanguages: [],
                                    }),
                                },
                                {
                                    id: segmentId,
                                    kind: 'text',
                                    label: `Block ${blockId}; segment ${segmentId}`,
                                    content: JSON.stringify({
                                        blockId,
                                        segment: {
                                            id: segmentId,
                                            text: 'Bonjour.',
                                        },
                                        translations: [],
                                    }),
                                },
                            ],
                        },
                    },
                ],
            },
        ];

        expect(contextualFixtureBlock(prompt, 'bilingual-text')).toMatchObject({
            id: blockId,
            segments: [{ id: segmentId, text: 'Bonjour.' }],
            translations: [],
        });
    });

    it('keeps source retrieval registered after a prior multi-tool turn', async () => {
        const blockId = randomUUID();
        const entryId = randomUUID();
        const vocabulary = {
            id: blockId,
            type: 'vocabulary' as const,
            title: 'Mentioned vocabulary updated',
            language: 'fr',
            translationLanguage: 'ru',
            entries: [
                {
                    id: entryId,
                    term: 'travail',
                    translation: 'travail amélioré',
                },
            ],
        };
        const source = projectConversationSource(
            'knowledge',
            {
                version: 'draft:2',
                title: 'Workbook',
                description: null,
                studiedLanguage: 'fr',
                provenance: 'draft',
                scope: 'workspace',
                material: [],
                blockTarget: {
                    branchId: randomUUID(),
                    version: 2,
                    material: learningBlockSourceMaterial([vocabulary]),
                },
            },
            'Update French vocabulary block fixture',
        );
        const memory = tutorMemoryFixture();
        const firstMessage = {
            id: randomUUID(),
            role: 'user' as const,
            content: 'Mentioned blocks update fixture',
            createdAt: '2026-10-30T00:00:00.000Z',
        };
        const message = {
            content:
                'Update French vocabulary block fixture: keep the existing entries and improve the first translation.',
            createdAt: '2026-10-30T00:00:00.000Z',
            id: randomUUID(),
            role: 'user' as const,
        };
        memory.messages.set(firstMessage.id, firstMessage);
        memory.messages.set(message.id, message);
        const provider = scriptedTutorModel([
            {
                toolName: 'read_source_context',
                input: { query: 'travail', limit: 5 },
            },
            {
                toolCalls: [
                    {
                        toolName: 'propose_learning_blocks',
                        input: {
                            targetBlockId: blockId,
                            blocks: [
                                {
                                    id: randomUUID(),
                                    type: 'grammar',
                                    language: 'fr',
                                    rule: 'Use the current vocabulary in a sentence.',
                                },
                            ],
                        },
                    },
                    {
                        toolName: 'propose_learning_blocks',
                        input: {
                            targetBlockId: randomUUID(),
                            blocks: [
                                {
                                    id: randomUUID(),
                                    type: 'grammar',
                                    language: 'fr',
                                    rule: 'Use a second current vocabulary sentence.',
                                },
                            ],
                        },
                    },
                ],
            },
            'The mentioned block update was prepared.',
            {
                toolName: 'read_source_context',
                input: { query: 'travail', limit: 5 },
            },
            'The updated vocabulary was read.',
        ]);

        const conversationId = randomUUID();
        const ownerId = randomUUID();
        const run = async (turnMessage: typeof message) =>
            createContextualTutorRunner({
                model: provider.model,
                accounting: tutorAccountingFixture(),
                maxInputTokens: 64_000,
            }).run({
                conversationId,
                ownerId,
                operationId: randomUUID(),
                conversationCreatedAt: '2026-10-30T00:00:00.000Z',
                message: turnMessage,
                preferences: {
                    mode: 'auto',
                    replyLanguage: 'auto',
                    tone: 'neutral',
                    explanationLevel: 'auto',
                },
                sourceContext: source.initialContext,
                memory: memory.port,
                signal: new AbortController().signal,
                onDelta: async () => undefined,
                onDraft: async () => ({ id: randomUUID() }),
                canProposeBlocks: true,
                onBlockProposal: async () => ({ id: randomUUID() }),
                readContext: async (input) => source.read(input),
            });

        await run(firstMessage);
        await run(message);

        expect(provider.requests).toHaveLength(5);
        expect(
            contextualFixtureBlock(provider.requests[4]?.prompt, 'vocabulary'),
        ).toMatchObject({
            id: blockId,
            title: 'Mentioned vocabulary updated',
            entries: [
                {
                    id: entryId,
                    term: 'travail',
                    translation: 'travail amélioré',
                },
            ],
        });
    });
});
