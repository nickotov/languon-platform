import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
    RequestKnowledgeTranslationSchema,
    KnowledgePrivateTranslationSchema,
} from './knowledge-private-translations';
import { CopyKnowledgeTextRequestSchema } from './knowledge-library-copy';
describe('private knowledge translation contracts', () => {
    it('accepts explicit request identity/language and refuses injected source or unsupported language', () => {
        const input = { operationId: randomUUID(), targetLanguage: 'fr' };
        expect(RequestKnowledgeTranslationSchema.parse(input)).toEqual(input);
        for (const patch of [
            { sourceText: 'malicious substitution' },
            { actorId: randomUUID() },
            { targetLanguage: 'zz-unsupported' },
        ])
            expect(
                RequestKnowledgeTranslationSchema.safeParse({
                    ...input,
                    ...patch,
                }).success,
            ).toBe(false);
    });
    it('requires exact original segment identifiers and a versioned private library pin', () => {
        const row = {
            noteId: randomUUID(),
            blockId: randomUUID(),
            sourceFingerprint: 'a'.repeat(64),
            targetLanguage: 'fr',
            segments: [{ sourceSegmentId: randomUUID(), text: 'Bonjour.' }],
            updatedAt: '2026-10-29T00:00:00Z',
        };
        expect(KnowledgePrivateTranslationSchema.parse(row)).toEqual(row);
        expect(
            CopyKnowledgeTextRequestSchema.parse({
                operationId: randomUUID(),
                noteId: row.noteId,
                noteVersion: 1,
                blockId: row.blockId,
                translationLanguage: 'fr',
                privateTranslation: {
                    sourceFingerprint: row.sourceFingerprint,
                    updatedAt: row.updatedAt,
                },
                destination: { kind: 'new', title: 'Private independent copy' },
            }).privateTranslation,
        ).toEqual({
            sourceFingerprint: row.sourceFingerprint,
            updatedAt: row.updatedAt,
        });
    });
});
