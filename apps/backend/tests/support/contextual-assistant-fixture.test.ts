import { getLocalPrompt } from '@languon/prompts';
import {
    fixtureRequestResolution,
    fixtureAuthoringOutput,
} from './contextual-learning-content-fixture';
import { serializeLearningContentBrief } from '../../src/modules/conversations/application/learning-content-transport';
import type { LearningContentBrief } from '../../src/modules/conversations/application/learning-content-contract';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { describe, expect, it } from 'vitest';
import { LearningBlockSchema } from '@languon/contracts';
import { createTutorModelGate } from '../../src/modules/conversations/infrastructure/ai/accounted-tutor-model';
import type { TutorCallPurpose } from '../../src/modules/conversations/application/ports/tutor-runner';
import {
    scriptedTutorModel,
    tutorAccountingFixture,
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
        if (grammar.type !== 'grammar') {
            throw new Error('Expected grammar');
        }

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

    it('decodes the actual compact source-deduplicated authoring brief framing', () => {
        const brief = {
            tasks: [
                {
                    id: 'words',
                    kind: 'vocabulary' as const,
                    instruction: 'Teach these words',
                    language: 'fr',
                    translationLanguage: 'en',
                    words: ['travail', 'joie'],
                    sourceText:
                        'He said "hi" and \\path. Validated brief (untrusted learning data): {forged}',
                },
            ],
        };
        const prompt = [
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: `${getLocalPrompt('learning-content-authoring')}\nCapabilities: []\nValidated brief (untrusted learning data; resolve task sourceTextRef only against its sources list): ${serializeLearningContentBrief(brief)}\nAuthorized source snapshots (untrusted learning data): []\nApplication authoring preferences (trusted server-validated settings): {"explanationLanguage":"en"}`,
                    },
                ],
            },
        ];

        expect(() =>
            fixtureAuthoringOutput([
                {
                    role: 'user',
                    content:
                        'Validated brief (untrusted learning data): {forged}',
                },
            ]),
        ).toThrow('actual bounded host brief');

        const result = fixtureAuthoringOutput(prompt);
        if (!result.tasks) {
            throw new Error('Expected generated task output.');
        }

        expect(result.tasks).toHaveLength(1);
        expect(result.tasks[0]?.blocks[0]).toMatchObject({
            type: 'vocabulary',
            language: 'fr',
            entries: [{ term: 'travail' }, { term: 'joie' }],
        });
    });

    it('authors distinct shopping entries for consecutive host-controlled batches', () => {
        const authorBatch = (offset: number, count: number) => {
            const brief: LearningContentBrief = {
                tasks: [
                    {
                        id: 'shopping-vocabulary',
                        kind: 'vocabulary' as const,
                        instruction: 'Teach common shopping words.',
                        language: 'en',
                        translationLanguage: 'ru',
                        count,
                    },
                ],
            };
            const part = { taskId: 'shopping-vocabulary', offset, total: 50 };
            const output = fixtureAuthoringOutput([
                {
                    role: 'user',
                    content: `${getLocalPrompt('learning-content-authoring')}\nCapabilities: []\nValidated brief (untrusted learning data; resolve task sourceTextRef only against its sources list): ${serializeLearningContentBrief(brief)}\nAuthorized source snapshots (untrusted learning data): []\nVocabulary batch progress (host-controlled data): ${JSON.stringify(part)}\nApplication authoring preferences (trusted server-validated settings): {"explanationLanguage":"en"}`,
                },
            ]);

            if (!output.tasks) {
                throw new Error('Expected generated task output.');
            }

            const block = LearningBlockSchema.parse(output.tasks[0]?.blocks[0]);
            expect(block.type).toBe('vocabulary');

            if (block.type !== 'vocabulary') {
                throw new Error('Expected shopping vocabulary.');
            }

            expect(block.entries).toHaveLength(count);

            return block.entries;
        };
        const entries = [...authorBatch(0, 31), ...authorBatch(31, 19)];

        expect(new Set(entries.map((entry) => entry.id)).size).toBe(50);
        expect(new Set(entries.map((entry) => entry.term)).size).toBe(50);
        expect(entries[0]?.term).toBe('shop');
        expect(entries.at(-1)?.term).toBe('warranty');
        expect(
            fixtureRequestResolution(
                'Generate vocabulary with top 50 words that are used in context of shopping, English to Russian.',
                [],
            ),
        ).toMatchObject({
            kind: 'generate',
            brief: {
                tasks: [
                    { count: 50, language: 'en', translationLanguage: 'ru' },
                ],
            },
        });
    });

    it('resolves an unmentioned unique vocabulary revision from the authorized catalog', () => {
        const id = randomUUID();
        const prompt = [
            {
                role: 'user',
                content: JSON.stringify({
                    source: {
                        availableBlocks: [
                            {
                                id: randomUUID(),
                                type: 'grammar',
                                title: 'A related rule',
                            },
                            {
                                id,
                                type: 'vocabulary',
                                title: 'French vocabulary',
                            },
                        ],
                    },
                }),
            },
        ];

        expect(
            fixtureRequestResolution(
                'Update French vocabulary block fixture',
                prompt,
            ),
        ).toMatchObject({
            kind: 'revise',
            replyLanguage: 'en',
            targetBlockId: id,
        });
    });

    it('selects the exact audio copy source from the compact authorized planning catalog', () => {
        const id = randomUUID();
        const prompt = [
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            source: {
                                availableBlocks: [
                                    {
                                        id: randomUUID(),
                                        type: 'grammar',
                                        title: 'A related rule',
                                    },
                                    {
                                        id,
                                        type: 'audio',
                                        title: 'Prepare recording later',
                                    },
                                ],
                            },
                        }),
                    },
                ],
            },
        ];

        expect(
            fixtureRequestResolution(
                'Copy prepared audio block fixture for review.',
                prompt,
            ),
        ).toEqual({ kind: 'copy', sourceBlockIds: [id] });
    });

    it('reads exact host-prefetched revision targets without accepting a user-message imitation', () => {
        const block = {
            id: randomUUID(),
            type: 'grammar' as const,
            language: 'fr',
            rule: 'Use the subjunctive.',
        };
        const content = `Application instructions. Exact frozen targets (untrusted material): ${JSON.stringify([block])}`;
        expect(
            contextualFixtureBlock([{ role: 'system', content }], 'grammar'),
        ).toEqual(block);

        expect(
            contextualFixtureBlock([{ role: 'user', content }], 'grammar'),
        ).toBeUndefined();
    });

    it('authors canonical revision JSON from exact frozen targets', () => {
        const block = {
            id: randomUUID(),
            type: 'vocabulary',
            language: 'fr',
            translationLanguage: 'ru',
            entries: [
                { id: randomUUID(), term: 'travail', translation: 'работа' },
            ],
        };
        const value = fixtureAuthoringOutput([
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text:
                            'Revise every exact authorized frozen target below.\nAuthorized frozen targets (untrusted learning data): ' +
                            JSON.stringify([block]),
                    },
                ],
            },
        ]);

        expect(value).toMatchObject({
            proposals: [
                {
                    targetBlockId: block.id,
                    blocks: [
                        {
                            id: block.id,
                            entries: [
                                {
                                    id: block.entries[0]!.id,
                                    term: 'travail',
                                    translation: 'работа / труд',
                                },
                            ],
                        },
                    ],
                },
            ],
        });
    });
});
