import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { LearningBlock } from '@languon/contracts';
import { KnowledgeBodySchema } from '@languon/contracts';
import {
    reconcileLearningBlockRevision,
    reconcileLearningBlockRevisions,
} from './learning-block-revision';

const blockId = randomUUID();
const entryId = randomUUID();
const vocabulary: Extract<LearningBlock, { type: 'vocabulary' }> = {
    id: blockId,
    type: 'vocabulary',
    language: 'fr',
    translationLanguage: 'en',
    entries: [{ id: entryId, term: 'bonjour', translation: 'hello' }],
};

describe('canonical learning-block revision identities', () => {
    it('recovers unchanged vocabulary terms while preserving edited IDs and allocating host IDs for additions', () => {
        const addition = randomUUID();
        const result = reconcileLearningBlockRevision(vocabulary, {
            ...vocabulary,
            entries: [
                {
                    ...vocabulary.entries[0]!,
                    id: randomUUID(),
                    translation: 'good morning',
                },
                { id: addition, term: 'merci', translation: 'thank you' },
            ],
        });

        if (result.type !== 'vocabulary') {
            throw new Error('Expected vocabulary.');
        }

        expect(result.entries[0]?.id).toBe(entryId);
        expect(result.entries[0]?.translation).toBe('good morning');
        expect(result.entries[1]?.id).not.toBe(addition);
        expect(result.entries[1]?.id).not.toBe(entryId);
        const changed = reconcileLearningBlockRevision(vocabulary, {
            ...vocabulary,
            entries: [{ id: entryId, term: 'salut', translation: 'hi' }],
        });

        expect(changed).toMatchObject({
            entries: [{ id: entryId, term: 'salut' }],
        });
    });

    it('keeps bilingual segment and alignment identities despite provider churn', () => {
        const oldId = randomUUID();
        const invented = randomUUID();
        const source: LearningBlock = {
            id: blockId,
            type: 'bilingual-text',
            language: 'fr',
            segments: [{ id: oldId, text: 'Bonjour.' }],
            translations: [
                {
                    language: 'en',
                    segments: [{ sourceSegmentId: oldId, text: 'Hello.' }],
                },
            ],
        };
        const result = reconcileLearningBlockRevision(source, {
            ...source,
            segments: [{ id: invented, text: 'Bonjour.' }],
            translations: [
                {
                    language: 'en',
                    segments: [
                        { sourceSegmentId: invented, text: 'Good morning.' },
                    ],
                },
            ],
        });

        expect(result).toMatchObject({
            segments: [{ id: oldId }],
            translations: [
                {
                    segments: [
                        { sourceSegmentId: oldId, text: 'Good morning.' },
                    ],
                },
            ],
        });
    });

    it('keeps transcript segments and multiple-choice identities, group and correct answer aligned', () => {
        const segmentId = randomUUID();
        const audio: LearningBlock = {
            id: blockId,
            type: 'audio',
            transcript: {
                language: 'fr',
                segments: [{ id: segmentId, text: 'Bonjour.' }],
            },
        };

        expect(
            reconcileLearningBlockRevision(audio, {
                ...audio,
                transcript: {
                    ...audio.transcript!,
                    segments: [{ id: randomUUID(), text: 'Bonjour.' }],
                },
            }),
        ).toMatchObject({ transcript: { segments: [{ id: segmentId }] } });

        const first = randomUUID();
        const second = randomUUID();
        const groupId = randomUUID();
        const invented = randomUUID();
        const source: LearningBlock = {
            id: blockId,
            type: 'exercise',
            format: 'multiple-choice',
            question: 'Choose.',
            referenceAnswer: 'Hello',
            explanation: 'A greeting.',
            group: { id: groupId },
            choices: [
                { id: first, text: 'Hello' },
                { id: second, text: 'Goodbye' },
            ],
            correctChoiceId: first,
        };

        expect(
            reconcileLearningBlockRevision(source, {
                ...source,
                group: { id: randomUUID() },
                choices: [
                    { id: invented, text: 'Hello' },
                    { id: second, text: 'Bye' },
                ],
                correctChoiceId: invented,
            }),
        ).toMatchObject({
            group: { id: groupId },
            choices: [{ id: first }, { id: second, text: 'Bye' }],
            correctChoiceId: first,
        });
    });

    it('recovers unchanged gaps and preserves an edited gap with its existing ID', () => {
        const first = randomUUID();
        const second = randomUUID();
        const source: LearningBlock = {
            id: blockId,
            type: 'exercise',
            format: 'fill-in-the-blank',
            question: 'Complete.',
            referenceAnswer: 'am here',
            explanation: 'Be present.',
            parts: [
                { kind: 'gap', id: first, acceptedAnswers: ['am'] },
                { kind: 'gap', id: second, acceptedAnswers: ['here'] },
            ],
        };

        expect(
            reconcileLearningBlockRevision(source, {
                ...source,
                parts: [
                    { kind: 'gap', id: randomUUID(), acceptedAnswers: ['am'] },
                    { kind: 'gap', id: second, acceptedAnswers: ['there'] },
                ],
            }),
        ).toMatchObject({
            parts: [{ id: first }, { id: second, acceptedAnswers: ['there'] }],
        });
    });

    it('rejects ambiguous unchanged item identities and deleted correct-answer references', () => {
        const duplicate = {
            ...vocabulary,
            entries: [
                vocabulary.entries[0]!,
                { ...vocabulary.entries[0]!, id: randomUUID() },
            ],
        };

        expect(() =>
            reconcileLearningBlockRevision(duplicate, {
                ...vocabulary,
                entries: [{ ...vocabulary.entries[0]!, id: randomUUID() }],
            }),
        ).toThrow('existing identities');

        const first = randomUUID();
        const second = randomUUID();
        const source: LearningBlock = {
            id: blockId,
            type: 'exercise',
            format: 'multiple-choice',
            question: 'Choose.',
            referenceAnswer: 'Yes',
            explanation: 'Affirmative.',
            choices: [
                { id: first, text: 'Yes' },
                { id: second, text: 'No' },
            ],
            correctChoiceId: first,
        };

        expect(() =>
            reconcileLearningBlockRevision(source, {
                ...source,
                choices: [
                    { id: second, text: 'No' },
                    { id: randomUUID(), text: 'Maybe' },
                ],
            }),
        ).toThrow();
    });

    it('remaps cross-target segment references after every selected target is reconciled', () => {
        const segmentId = randomUUID();
        const invented = randomUUID();
        const source: LearningBlock = {
            id: blockId,
            type: 'bilingual-text',
            language: 'fr',
            segments: [{ id: segmentId, text: 'Bonjour.' }],
            translations: [],
        };
        const exercise: LearningBlock = {
            id: randomUUID(),
            type: 'exercise',
            format: 'free-text',
            question: 'Translate.',
            referenceAnswer: 'Hello',
            explanation: 'Greeting.',
            source: { blockId, segmentIds: [segmentId] },
        };
        const result = reconcileLearningBlockRevisions(
            [exercise, source],
            [
                { ...exercise, source: { blockId, segmentIds: [invented] } },
                { ...source, segments: [{ id: invented, text: 'Bonjour.' }] },
            ],
        );

        expect(result[0]).toMatchObject({
            source: { segmentIds: [segmentId] },
        });

        expect(result[1]).toMatchObject({ segments: [{ id: segmentId }] });
    });

    it('rejects removed segment references in the selected set and the complete document validator', () => {
        const kept = randomUUID();
        const removed = randomUUID();
        const source: LearningBlock = {
            id: blockId,
            type: 'bilingual-text',
            language: 'fr',
            segments: [
                { id: kept, text: 'Bonjour.' },
                { id: removed, text: 'Merci.' },
            ],
            translations: [],
        };
        const exercise: LearningBlock = {
            id: randomUUID(),
            type: 'exercise',
            format: 'free-text',
            question: 'Translate.',
            referenceAnswer: 'Thanks',
            explanation: 'Gratitude.',
            source: { blockId, segmentIds: [removed] },
        };
        const replacement: LearningBlock = {
            ...source,
            segments: [source.segments[0]!],
        };

        expect(() =>
            reconcileLearningBlockRevisions(
                [source, exercise],
                [replacement, exercise],
            ),
        ).toThrow('removed source segment');

        expect(
            KnowledgeBodySchema.safeParse({
                schemaVersion: 2,
                document: {
                    type: 'doc',
                    content: [replacement, exercise].map((block) => ({
                        type: 'learningBlock',
                        attrs: { block },
                    })),
                },
            }).success,
        ).toBe(false);
    });
});
