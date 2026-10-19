import { describe, expect, it } from 'vitest';
import { CopiedAttachmentSchema } from '@languon/contracts';
import {
    assertTutorCurrentMessageFits,
    currentTutorMessageByteLimit,
    projectTutorUserMessage,
    tutorCurrentMessageBytes,
} from '../../../../src/modules/conversations/application/tutor-message-context';

const id = '00000000-0000-4000-8000-000000000001';
describe('current tutor message admission budget', () => {
    it('rejects Unicode or multiple individually valid copies by their aggregate encoded UTF-8 size', () => {
        for (const attachments of [
            [{ id, label: 'A Unicode passage', content: '例'.repeat(3000) }],
            Array.from({ length: 4 }, () => ({
                id,
                label: 'A copied passage',
                content: '👋'.repeat(600),
            })),
        ]) {
            for (const attachment of attachments)
                CopiedAttachmentSchema.parse(attachment);
            const projection = projectTutorUserMessage({
                content: 'Explain.',
                attachments,
            });
            expect(tutorCurrentMessageBytes(projection)).toBeGreaterThan(
                currentTutorMessageByteLimit,
            );
            expect(() => assertTutorCurrentMessageFits(projection)).toThrow(
                expect.objectContaining({ code: 'context_too_large' }),
            );
        }
    });

    it('projects every typed-card field once and preserves the original immutable copied payload', () => {
        const card = {
            source: 'شاطئ',
            translation: 'bank',
            sourceLanguage: 'ar',
            targetLanguage: 'en',
            definition: 'أرض بجانب النهر',
            definitionLanguage: 'ar',
        };
        const attachment = CopiedAttachmentSchema.parse({
            id,
            label: 'Copied card',
            kind: 'dictionary-card',
            card,
            content: JSON.stringify(card),
        });
        const original = structuredClone(attachment);
        const projection = projectTutorUserMessage({
            content: 'Explain.',
            attachments: [attachment],
        });
        const copied = projection.parts.find((part) =>
            part.text.startsWith('Copied learning material'),
        )!.text;
        const encoded = JSON.parse(
            copied.slice(copied.indexOf('\n') + 1),
        ) as Record<string, unknown>[];
        expect(encoded).toEqual([
            { id, label: attachment.label, kind: 'dictionary-card', card },
        ]);
        expect(copied.split(card.source)).toHaveLength(2);
        expect(attachment).toEqual(original);
    });

    it('accounts for escaped source provenance and transport framing, without truncating accepted text', () => {
        const source = {
            sourceKind: 'text' as const,
            version: '1',
            provenance: 'saved' as const,
            title: 'A "quoted" title',
            studiedLanguage: 'ja',
        };
        const content = 'Explain "例" 👋\\\n'.repeat(80);
        const projection = projectTutorUserMessage({ content, source });
        expect(tutorCurrentMessageBytes(projection)).toBe(
            Buffer.byteLength(
                JSON.stringify({ role: 'user', content: projection.parts }),
                'utf8',
            ) + 1024,
        );
        expect(() => assertTutorCurrentMessageFits(projection)).not.toThrow();
        expect(projection.parts[0]?.text).toBe(content);
        expect(JSON.stringify(projection)).toContain(
            'Application source provenance',
        );
    });
});
