import { describe, expect, it } from 'vitest';
import {
    ConversationMessageSchema,
    ConversationResponseMetadataSchema,
    type ConversationMessage,
    type ConversationResponseMetadata,
} from '@languon/contracts';
import { canUseResponseInDocument } from '../src/fsd/widgets/contextual-assistant/lib/response-document-use';

function answer(metadata?: ConversationResponseMetadata): ConversationMessage {
    return ConversationMessageSchema.parse({
        id: '00000000-0000-4000-8000-000000000001',
        conversationId: '00000000-0000-4000-8000-000000000002',
        turnId: '00000000-0000-4000-8000-000000000003',
        role: 'assistant',
        content: 'I can help with vocabulary and grammar.',
        attachments: [],
        status: 'complete',
        sourceVersion: '1',
        sourceProvenance: 'draft',
        createdAt: '2026-11-04T00:00:00.000Z',
        ...(metadata ? { responseMetadata: metadata } : {}),
    });
}

describe('tutor document actions', () => {
    it.each([
        'conversation',
        'clarification',
        'generation',
        'limitation',
    ] as const)('does not turn a %s answer into a prose proposal', (kind) => {
        expect(
            canUseResponseInDocument(answer({ kind, documentUse: false })),
        ).toBe(false);
    });

    it('allows useful explanations only after canonical completion', () => {
        const message = answer({
            kind: 'learning-explanation',
            documentUse: true,
        });

        expect(canUseResponseInDocument(message)).toBe(true);
        expect(
            canUseResponseInDocument({ ...message, status: 'streaming' }),
        ).toBe(false);

        expect(
            canUseResponseInDocument({ ...message, status: 'incomplete' }),
        ).toBe(false);
    });

    it('requires an explicit editor request for historical answers', () => {
        const message = answer();
        expect(canUseResponseInDocument(message)).toBe(false);

        message.editorTarget = {
            from: 0,
            to: 0,
            originalText: '',
            documentHash: '0'.repeat(64),
            proposalMode: 'append',
        };

        expect(canUseResponseInDocument(message)).toBe(true);
    });

    it('uses the canonical classification even when a prior anchor exists', () => {
        const message = answer({ kind: 'clarification', documentUse: false });
        message.editorTarget = {
            from: 0,
            to: 0,
            originalText: '',
            documentHash: '0'.repeat(64),
            proposalMode: 'append',
        };

        expect(canUseResponseInDocument(message)).toBe(false);
    });

    it('rejects capability-help metadata that grants a prose document action', () => {
        expect(
            ConversationResponseMetadataSchema.safeParse({
                kind: 'conversation',
                documentUse: true,
            }).success,
        ).toBe(false);
    });
});
