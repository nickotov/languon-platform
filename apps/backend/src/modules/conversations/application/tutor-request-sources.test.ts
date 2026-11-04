import { describe, expect, it } from 'vitest';
import type { LearningBlock } from '@languon/contracts';
import { projectTutorUserMessage } from './tutor-message-context';
import {
    frozenTutorTextSources,
    groundLearningContentBrief,
} from './tutor-request-sources';
import type { TutorRunInput } from './ports/tutor-runner';
import { TutorRequestResolutionSchema } from './tutor-request-contract';
import {
    describeLearningProposal,
    proposalSelectionNeedsClarification,
} from '../infrastructure/ai/tutor-request-proposals';

const proposalId = '01900000-0000-4000-8000-000000000001';
const blockId = '01900000-0000-4000-8000-000000000002';
const vocabulary: LearningBlock = {
    id: blockId,
    type: 'vocabulary',
    language: 'fr',
    translationLanguage: 'en',
    entries: [
        {
            id: '01900000-0000-4000-8000-000000000003',
            term: 'travail',
            translation: 'work',
        },
    ],
};

describe('host-owned exact learning source selection', () => {
    it('preserves near-limit current and selected passages without asking the planner to copy them', () => {
        const editor = 'Été: la source entière. '.repeat(1_500);
        const selection = 'Été: la source entière. '.repeat(100);
        const input = {
            message: {
                content: 'Make exercises from selection.',
                modelContent: projectTutorUserMessage({
                    content: 'Make exercises from selection.',
                    editorContext: { content: editor, selectedText: selection },
                }),
            },
        } as unknown as TutorRunInput;
        const sources = frozenTutorTextSources(input);
        const task = {
            id: 'exercise',
            kind: 'exercises' as const,
            instruction: 'Practise the frozen text.',
            language: 'fr',
        };

        expect(
            groundLearningContentBrief(
                { tasks: [{ ...task, source: { kind: 'editor' } }] },
                sources,
                new Map(),
            ).tasks[0]?.sourceText,
        ).toBe(editor);

        expect(
            groundLearningContentBrief(
                { tasks: [{ ...task, source: { kind: 'selection' } }] },
                sources,
                new Map(),
            ).tasks[0]?.sourceText,
        ).toBe(selection);
    });

    it('grounds each task independently and never overwrites explicit words or an explicit passage', () => {
        const tasks = [
            {
                id: 'practice',
                kind: 'exercises' as const,
                instruction: 'Use prior words with this passage.',
                language: 'fr',
                words: ['congé'],
                sourceText: 'Un passage explicitement choisi.',
                source: { kind: 'proposal' as const, proposalId },
            },
            {
                id: 'grammar',
                kind: 'grammar' as const,
                instruction: 'Explain the future.',
                language: 'fr',
            },
        ];
        const grounded = groundLearningContentBrief(
            { tasks },
            {},
            new Map([[proposalId, [vocabulary]]]),
        );

        expect(grounded.tasks[0]).toMatchObject({
            words: ['congé'],
            sourceText: 'Un passage explicitement choisi.',
        });

        expect(grounded.tasks[1]?.sourceText).toBeUndefined();
    });

    it('passes actual bilingual source wording rather than serialized block JSON to follow-up authoring', () => {
        const source: LearningBlock = {
            id: blockId,
            type: 'bilingual-text',
            language: 'fr',
            segments: [
                {
                    id: '01900000-0000-4000-8000-000000000004',
                    text: 'Le travail commence.',
                },
            ],
            translations: [],
        };
        const grounded = groundLearningContentBrief(
            {
                tasks: [
                    {
                        id: 'translation',
                        kind: 'bilingual-text',
                        instruction:
                            'Translate the prior passage into Spanish.',
                        language: 'fr',
                        translationLanguage: 'es',
                        source: { kind: 'proposal', proposalId },
                    },
                ],
            },
            {},
            new Map([[proposalId, [source]]]),
        );

        expect(grounded.tasks[0]?.sourceText).toBe('Le travail commence.');
        expect(grounded.tasks[0]?.sourceText).not.toContain('segments');
    });

    it('rejects replacement targets on generation plans', () => {
        expect(
            TutorRequestResolutionSchema.safeParse({
                kind: 'generate',
                replyLanguage: 'en',
                targetBlockId: blockId,
                brief: {
                    tasks: [
                        {
                            id: 'practice',
                            kind: 'exercises',
                            instruction: 'Create new exercises.',
                            language: 'fr',
                        },
                    ],
                },
            }).success,
        ).toBe(false);
    });

    it('disambiguates by exact canonical vocabulary terms, while ambiguous and out-of-catalog references require clarification', () => {
        const first = describeLearningProposal(
            proposalId,
            [vocabulary],
            'Vocabulary',
            1,
        );
        const secondId = '01900000-0000-4000-8000-000000000005';
        const other = {
            ...vocabulary,
            entries: [{ ...vocabulary.entries[0]!, term: 'école' }],
        };
        const catalog = [
            first,
            describeLearningProposal(secondId, [other], 'Vocabulary', 2),
        ];

        expect(first).toMatchObject({
            kinds: ['vocabulary'],
            terms: ['travail'],
            ordinal: 1,
        });

        expect(
            proposalSelectionNeedsClarification(
                catalog,
                [proposalId],
                'Use the one containing travail.',
                'travail',
            ),
        ).toBe(false);

        expect(
            proposalSelectionNeedsClarification(
                catalog,
                [proposalId],
                'Use those words.',
            ),
        ).toBe(true);

        expect(
            proposalSelectionNeedsClarification(
                catalog,
                ['01900000-0000-4000-8000-000000000099'],
                'Use an old proposal.',
            ),
        ).toBe(true);
    });
});
