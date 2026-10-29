import { describe, expect, it } from 'vitest';
import { KnowledgeBodySchema, type LearningBlock } from '@languon/contracts';
import { buildExerciseFeedbackRequest } from '@/fsd/entities/learning-blocks';
import { exerciseSource } from '../src/fsd/features/workbook-learning/lib/exercise-source';
const mediaId = '11111111-1111-4111-8111-111111111111';
const segmentId = '22222222-2222-4222-8222-222222222222';
const exercise: LearningBlock = {
    id: '33333333-3333-4333-8333-333333333333',
    type: 'exercise',
    format: 'free-text',
    question: 'What happened?',
    referenceAnswer: 'She left.',
    explanation: 'Departure.',
    source: { blockId: mediaId, segmentIds: [segmentId] },
};
describe('exercise media source replay projection', () => {
    it.each([
        { kind: 'youtube' as const, videoId: 'abcdefghijk' },
        { kind: 'url' as const, url: 'https://media.example/lesson.mp4' },
    ])(
        'preserves validated $kind video replay and only selected transcript passages',
        (source) => {
            const body = KnowledgeBodySchema.parse({
                schemaVersion: 2,
                document: {
                    type: 'doc',
                    content: [
                        {
                            type: 'learningBlock',
                            attrs: {
                                block: {
                                    id: mediaId,
                                    type: 'video',
                                    source,
                                    transcript: {
                                        language: 'en',
                                        segments: [
                                            {
                                                id: segmentId,
                                                text: 'Relevant',
                                                timing: {
                                                    startSeconds: 10,
                                                    endSeconds: 15,
                                                },
                                            },
                                            {
                                                id: '44444444-4444-4444-8444-444444444444',
                                                text: 'Hidden remainder',
                                            },
                                        ],
                                    },
                                },
                            },
                        },
                    ],
                },
            });
            expect(exerciseSource(exercise, body)).toMatchObject({
                videoSource: source,
                transcript: {
                    segments: [
                        {
                            id: segmentId,
                            text: 'Relevant',
                            timing: { startSeconds: 10, endSeconds: 15 },
                        },
                    ],
                },
            });
            expect(exerciseSource(exercise, body).audioAssetId).toBeUndefined();
        },
    );
    it('does not create a playback descriptor without a resolvable media source', () => {
        const body = KnowledgeBodySchema.parse({
            schemaVersion: 2,
            document: {
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        content: [
                            {
                                type: 'text',
                                text: 'https://unsupported.example/video',
                            },
                        ],
                    },
                ],
            },
        });
        expect(exerciseSource(exercise, body)).toEqual({});
    });
    it('projects selected bilingual originals in document order and includes only those passages in feedback', () => {
        const later = '44444444-4444-4444-8444-444444444444';
        const hidden = '55555555-5555-4555-8555-555555555555';
        const block: LearningBlock = {
            id: mediaId,
            type: 'bilingual-text',
            language: 'en',
            segments: [
                { id: segmentId, text: 'First selected passage' },
                { id: hidden, text: 'UNSELECTED SECRET PASSAGE' },
                { id: later, text: 'Second selected passage' },
            ],
            translations: [
                {
                    language: 'es',
                    segments: [
                        { sourceSegmentId: segmentId, text: 'Primer pasaje' },
                        {
                            sourceSegmentId: hidden,
                            text: 'UNSELECTED TRANSLATION',
                        },
                        { sourceSegmentId: later, text: 'Segundo pasaje' },
                    ],
                },
            ],
        };
        const linked = {
            ...exercise,
            source: { blockId: mediaId, segmentIds: [later, segmentId] },
        };
        const body = KnowledgeBodySchema.parse({
            schemaVersion: 2,
            document: {
                type: 'doc',
                content: [{ type: 'learningBlock', attrs: { block } }],
            },
        });
        const projected = exerciseSource(linked, body);
        expect(projected.transcript).toEqual({
            language: 'en',
            segments: [
                { id: segmentId, text: 'First selected passage' },
                { id: later, text: 'Second selected passage' },
            ],
        });
        expect(projected.videoSource).toBeUndefined();
        expect(projected.audioAssetId).toBeUndefined();
        if (linked.type !== 'exercise') throw new Error('exercise required');
        const request = buildExerciseFeedbackRequest(
            linked,
            'My alternative answer',
            projected.block,
        );
        expect(request.prompt).toContain('First selected passage');
        expect(request.prompt).toContain('Second selected passage');
        expect(request.prompt).toContain('Primer pasaje');
        expect(request.prompt).not.toContain('UNSELECTED SECRET PASSAGE');
        expect(request.prompt).not.toContain('UNSELECTED TRANSLATION');
    });
    it('fails closed rather than showing a partially resolved bilingual hint', () => {
        const body = KnowledgeBodySchema.parse({
            schemaVersion: 2,
            document: {
                type: 'doc',
                content: [
                    {
                        type: 'learningBlock',
                        attrs: {
                            block: {
                                id: mediaId,
                                type: 'bilingual-text',
                                language: 'en',
                                segments: [
                                    { id: segmentId, text: 'A passage' },
                                ],
                                translations: [],
                            },
                        },
                    },
                ],
            },
        });
        expect(
            exerciseSource(
                {
                    ...exercise,
                    source: {
                        blockId: mediaId,
                        segmentIds: [
                            segmentId,
                            '44444444-4444-4444-8444-444444444444',
                        ],
                    },
                },
                body,
            ),
        ).toEqual({});
    });
});
