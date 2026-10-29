import { expect, it } from 'vitest';
import { KnowledgeBodySchema } from '@languon/contracts';
import { knowledgeBodyPlainText } from './knowledge';
import { randomUUID } from 'node:crypto';
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
