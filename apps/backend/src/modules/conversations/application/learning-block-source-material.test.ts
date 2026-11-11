import { describe, expect, it } from 'vitest';
import { learningBlockSourceMaterial } from './learning-block-source-material';
import {
    projectConversationSource,
    retrievedSourceContextBytes,
} from './conversation-source-context';
import { tutorReservedInputBytes } from './tutor-context-budget';
import type { ConversationSourceSnapshot } from '../domain/conversation';

const blockId = '01900000-0000-4000-8000-000000000010';
const segmentId = '01900000-0000-4000-8000-000000000011';
const bytesOf = (value: unknown) =>
    Buffer.byteLength(JSON.stringify(value), 'utf8');

describe('Frozen structured block context', () => {
    it('preserves actual transcript IDs through bounded retrieval while keeping workspace text separate', () => {
        const material = learningBlockSourceMaterial([
            {
                id: blockId,
                type: 'audio',
                assetId: '01900000-0000-4000-8000-000000000012',
                transcript: {
                    language: 'es',
                    segments: [
                        {
                            id: segmentId,
                            text: 'A train arrived in Madrid.',
                            timing: { startSeconds: 0, endSeconds: 3 },
                        },
                    ],
                },
            },
        ]);
        const snapshot: ConversationSourceSnapshot = {
            version: 'draft:1',
            title: 'Listening',
            description: null,
            studiedLanguage: 'es',
            provenance: 'draft',
            scope: 'workspace',
            material: [],
            blockTarget: { branchId: blockId, version: 1, material },
        };
        const source = projectConversationSource(
            'knowledge',
            snapshot,
            'train',
        );

        expect(source.initialContext.includedMaterialCount).toBe(0);
        expect(source.initialContext.availableMaterialCount).toBe(2);
        const selected = source.read({ query: 'train', limit: 5 });
        expect(JSON.stringify(selected)).toContain(blockId);
        expect(JSON.stringify(selected)).toContain(segmentId);
        expect(JSON.stringify(selected)).toContain('Madrid');
        expect(
            Buffer.byteLength(
                JSON.stringify({ ...selected, coverage: 'partial' }),
            ),
        ).toBeLessThanOrEqual(retrievedSourceContextBytes);

        const input = {
            message: {
                id: 'message',
                role: 'user' as const,
                content: 'Explain',
                createdAt: '2026-10-28T00:00:00Z',
            },
            preferences: {
                mode: 'auto' as const,
                replyLanguage: 'auto' as const,
                tone: 'neutral' as const,
                explanationLevel: 'auto' as const,
            },
            sourceContext: source.initialContext,
        };
        const withMaximumFutureRead = {
            ...input,
            sourceContext: {
                ...source.initialContext,
                retrievedContextByteBound: retrievedSourceContextBytes,
            },
        };

        // Future reads consume their own dispatch budget; initial admission
        // carries only this bounded diagnostic metadata, never its byte value.
        expect(
            Math.abs(
                tutorReservedInputBytes(input) -
                    tutorReservedInputBytes(withMaximumFutureRead),
            ),
        ).toBeLessThan(64);

        expect(tutorReservedInputBytes(input) + bytesOf(selected)).toBeLessThan(
            64_000,
        );
    });

    it('bounds long transcript retrieval and carries segment identity on every excerpt', () => {
        const material = learningBlockSourceMaterial([
            {
                id: blockId,
                type: 'audio',
                assetId: '01900000-0000-4000-8000-000000000012',
                transcript: {
                    language: 'es',
                    segments: [{ id: segmentId, text: '東京'.repeat(3_000) }],
                },
            },
        ]);
        const source = projectConversationSource(
            'knowledge',
            {
                version: '1',
                title: '',
                description: null,
                studiedLanguage: 'es',
                provenance: 'draft',
                scope: 'workspace',
                material: [],
                blockTarget: { branchId: blockId, version: 1, material },
            },
            '東京',
        );
        const selected = source.read({ query: '東京', limit: 24 });
        expect(
            Buffer.byteLength(
                JSON.stringify({ ...selected, coverage: 'partial' }),
            ),
        ).toBeLessThanOrEqual(retrievedSourceContextBytes);

        expect(
            selected.material.some((item) => item.label.includes(segmentId)),
        ).toBe(true);
    });
});

it('bounds exact frozen retrieval independently of initial dispatch reservation for a small workspace', () => {
    const material = learningBlockSourceMaterial([
        {
            id: blockId,
            type: 'vocabulary',
            language: 'fr',
            translationLanguage: 'ru',
            entries: [
                { id: segmentId, term: 'travail', translation: 'работа' },
            ],
        },
    ]);
    const source = projectConversationSource(
        'knowledge',
        {
            version: 'draft:1',
            title: 'Small vocabulary',
            description: null,
            studiedLanguage: 'fr',
            provenance: 'draft',
            scope: 'workspace',
            material: [],
            blockTarget: { branchId: blockId, version: 1, material },
        },
        'travail',
    );
    const bound = source.initialContext.retrievedContextByteBound;
    expect(bound).toBeLessThan(1000);
    for (const query of ['travail', 'работа', 'missing', '']) {
        const read = source.read({ query, limit: 25 });
        expect(
            Buffer.byteLength(JSON.stringify({ ...read, coverage: 'partial' })),
        ).toBeLessThanOrEqual(bound);
    }

    const input = {
        message: {
            id: 'm',
            role: 'user' as const,
            content: 'Update the translation.',
            createdAt: '2026-10-29T00:00:00.000Z',
        },
        sourceContext: source.initialContext,
        preferences: {
            mode: 'auto' as const,
            replyLanguage: 'auto' as const,
            tone: 'neutral' as const,
            explanationLevel: 'auto' as const,
        },
    };
    const withMaximumFutureRead = {
        ...input,
        sourceContext: {
            ...source.initialContext,
            retrievedContextByteBound: retrievedSourceContextBytes,
        },
    };

    expect(tutorReservedInputBytes(input) + 4096).toBeLessThan(64_000);
    expect(
        Math.abs(
            tutorReservedInputBytes(withMaximumFutureRead) -
                tutorReservedInputBytes(input),
        ),
    ).toBeLessThan(64);

    const exactRead = source.read({ query: 'travail', limit: 25 });
    expect(JSON.stringify(exactRead)).toContain('travail');
    expect(JSON.stringify(exactRead)).toContain('работа');
    expect(tutorReservedInputBytes(input) + bytesOf(exactRead)).toBeLessThan(
        64_000,
    );
});

it('bounds every subset and relevance-neighbor read with escaped Unicode by the full frozen tool wrapper', () => {
    const text = '\\"\n Французский 😀 français '.repeat(700);
    const source = projectConversationSource(
        'knowledge',
        {
            version: 'draft:2',
            title: 'Escaped material',
            description: null,
            studiedLanguage: 'fr',
            provenance: 'draft',
            scope: 'workspace',
            material: [],
            blockTarget: {
                branchId: blockId,
                version: 2,
                material: [
                    {
                        id: blockId,
                        kind: 'text',
                        label: 'Quotes " русский',
                        content: text,
                    },
                    {
                        id: segmentId,
                        kind: 'text',
                        label: 'Neighbour',
                        content: 'A neighbouring source.',
                    },
                ],
            },
        },
        'Français',
    );
    const bound = source.initialContext.retrievedContextByteBound;
    expect(bound).toBeLessThanOrEqual(retrievedSourceContextBytes);
    for (const query of [
        'Français',
        'русский',
        'Neighbour',
        'unmatched',
        'Français русский '.repeat(20),
    ]) {
        for (const limit of [1, 2, 5, 10, 24]) {
            const result = source.read({ query, limit });
            expect(new Set(result.material.map((item) => item.id)).size).toBe(
                result.material.length,
            );

            const coverage =
                result.material.length >= result.total ? 'complete' : 'partial';

            expect(
                Buffer.byteLength(
                    JSON.stringify({ ...result, coverage }),
                    'utf8',
                ),
            ).toBeLessThanOrEqual(bound);
        }
    }
});

it('retrieves authored video descriptions and grouped exercise hints within the frozen material reservation', () => {
    const description =
        'Author says: "поезд 🚆" arrives.\\No video was fetched.';
    const hint = 'Find the arrival platform.\nUse the author’s description.';
    const material = learningBlockSourceMaterial([
        {
            id: blockId,
            type: 'video',
            source: { kind: 'youtube', videoId: 'dQw4w9WgXcQ' },
            description,
        },
        {
            id: segmentId,
            type: 'exercise',
            format: 'free-text',
            question: 'What arrives?',
            referenceAnswer: 'A train',
            explanation: 'The description names a train.',
            hint,
            group: {
                id: '01900000-0000-4000-8000-000000000012',
                title: 'Arrival practice',
                parentBlockId: blockId,
            },
        },
    ]);
    const source = projectConversationSource(
        'knowledge',
        {
            version: 'saved:1',
            title: 'Station',
            description: null,
            studiedLanguage: 'fr',
            provenance: 'saved',
            material,
        },
        'author description',
    );
    const result = source.read({ query: 'arrival', limit: 5 });
    const encoded = JSON.stringify({ ...result, coverage: 'complete' });
    expect(encoded).toContain('Arrival practice');
    expect(encoded).toContain('arrival platform');
    expect(encoded).toContain('поезд');
    expect(Buffer.byteLength(encoded)).toBeLessThanOrEqual(
        source.initialContext.retrievedContextByteBound!,
    );

    expect(source.initialContext.retrievedContextByteBound).toBeLessThanOrEqual(
        retrievedSourceContextBytes,
    );
});
