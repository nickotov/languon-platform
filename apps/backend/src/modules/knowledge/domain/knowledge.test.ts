import { expect, it } from 'vitest';
import { KnowledgeBodySchema } from '@languon/contracts';
import { knowledgeBodyPlainText } from './knowledge';
import { randomUUID } from 'node:crypto';
it('indexes H1 words and treats rules as separators without making a rule-only document nonempty', () => {
    for (const schemaVersion of [1, 2]) {
        const body = KnowledgeBodySchema.parse({
            schemaVersion,
            document: {
                type: 'doc',
                content: [
                    {
                        type: 'heading',
                        attrs: { level: 1 },
                        content: [{ type: 'text', text: 'Bonjour' }],
                    },
                    { type: 'horizontalRule' },
                    {
                        type: 'paragraph',
                        content: [{ type: 'text', text: 'Monde' }],
                    },
                ],
            },
        });
        expect(knowledgeBodyPlainText(body)).toBe('Bonjour Monde');
        expect(
            knowledgeBodyPlainText(
                KnowledgeBodySchema.parse({
                    schemaVersion,
                    document: {
                        type: 'doc',
                        content: [{ type: 'horizontalRule' }],
                    },
                }),
            ),
        ).toBe('');
    }
});
it('indexes words crossing inline marks as a single word and preserves block boundaries', () => {
    const body = KnowledgeBodySchema.parse({
        schemaVersion: 1,
        document: {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [
                        { type: 'text', text: 'bon' },
                        {
                            type: 'text',
                            text: 'jour',
                            marks: [{ type: 'bold' }],
                        },
                    ],
                },
                {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'tout le monde' }],
                },
            ],
        },
    });
    expect(knowledgeBodyPlainText(body)).toBe('bonjour tout le monde');
});

it('projects interactive block learning content without exposing asset identities', () => {
    const assetId = randomUUID();
    const body = KnowledgeBodySchema.parse({
        schemaVersion: 2,
        document: {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Listen' }],
                },
                {
                    type: 'learningBlock',
                    attrs: {
                        block: {
                            id: randomUUID(),
                            type: 'audio',
                            assetId,
                            transcript: {
                                language: 'en',
                                segments: [
                                    {
                                        id: randomUUID(),
                                        text: 'A train arrives.',
                                    },
                                ],
                            },
                        },
                    },
                },
            ],
        },
    });
    const projected = knowledgeBodyPlainText(body);
    expect(projected).toBe('Listen Audio A train arrives.');
    expect(projected).not.toContain(assetId);
});

it('retains useful content for a media-only note without claiming media understanding', () => {
    const body = KnowledgeBodySchema.parse({
        schemaVersion: 2,
        document: {
            type: 'doc',
            content: [
                {
                    type: 'learningBlock',
                    attrs: {
                        block: {
                            id: randomUUID(),
                            type: 'video',
                            source: { kind: 'youtube', videoId: 'dQw4w9WgXcQ' },
                        },
                    },
                },
            ],
        },
    });
    expect(knowledgeBodyPlainText(body)).toBe('Video');
});

it('projects author descriptions, exercise hints and group titles from saved material without presentation identities', () => {
    const videoId = randomUUID();
    const groupId = randomUUID();
    const body = KnowledgeBodySchema.parse({
        schemaVersion: 2,
        document: {
            type: 'doc',
            content: [
                {
                    type: 'learningBlock',
                    attrs: {
                        block: {
                            id: videoId,
                            type: 'video',
                            source: { kind: 'youtube', videoId: 'dQw4w9WgXcQ' },
                            description: 'Author description: a train arrives.',
                        },
                    },
                },
                {
                    type: 'learningBlock',
                    attrs: {
                        block: {
                            id: randomUUID(),
                            type: 'exercise',
                            format: 'free-text',
                            question: 'What arrives?',
                            referenceAnswer: 'A train',
                            explanation: 'The author describes a train.',
                            hint: 'Look at the station.',
                            group: {
                                id: groupId,
                                title: 'Listening practice',
                                parentBlockId: videoId,
                            },
                        },
                    },
                },
            ],
        },
    });
    const text = knowledgeBodyPlainText(body);
    expect(text).toContain('Author description: a train arrives.');
    expect(text).toContain('Listening practice');
    expect(text).toContain('Look at the station.');
    expect(text).not.toContain(groupId);
    expect(text).not.toContain(videoId);
});
