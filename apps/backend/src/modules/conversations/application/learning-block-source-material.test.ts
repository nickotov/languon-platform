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
        const legacy = {
            ...input,
            sourceContext: {
                ...source.initialContext,
                availableMaterialCount: 0,
                blockProposalsAvailable: false,
            },
        };
        expect(
            tutorReservedInputBytes(input) - tutorReservedInputBytes(legacy),
        ).toBeGreaterThan(retrievedSourceContextBytes);
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
