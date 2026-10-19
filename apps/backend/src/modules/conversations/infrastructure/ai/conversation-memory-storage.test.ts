import { describe, expect, it, vi } from 'vitest';
import {
    ConversationMemoryStorage,
    toTutorModelMessage,
} from './conversation-memory-storage.js';
import { tutorMemoryFixture } from './tutor-test-fixtures.js';

function fixture() {
    const memory = tutorMemoryFixture([
        {
            id: 'admitted-user',
            role: 'user',
            content: 'Explain casa.',
            createdAt: '2026-10-19T00:00:00.000Z',
            attachments: [
                { id: 'copy-1', label: 'Copied card', content: 'la casa' },
            ],
        },
    ]);
    const storage = new ConversationMemoryStorage({
        conversationId: 'conversation-1',
        ownerId: 'owner-1',
        createdAt: '2026-10-19T00:00:00.000Z',
        port: memory.port,
    });
    return { memory, storage };
}

describe('conversation-bound Mastra memory storage', () => {
    it('preserves admitted readable text and copies while retaining genuine private model parts', async () => {
        const { memory, storage } = fixture();
        const saving = vi.spyOn(memory.port, 'saveMessages');
        const original = memory.messages.get('admitted-user')!;
        const modelContent = {
            format: 2,
            parts: [
                { type: 'text', text: original.content },
                {
                    type: 'text',
                    text: 'SOURCE_PROVENANCE: saved text revision 2; historical wording.',
                },
            ],
        };
        await storage.saveMessages({
            messages: [
                toTutorModelMessage(
                    { ...original, modelContent },
                    'conversation-1',
                    'owner-1',
                ),
            ],
        });
        expect(saving).toHaveBeenCalledExactlyOnceWith([
            { ...original, modelContent },
        ]);
        expect(memory.messages.get('admitted-user')?.content).toBe(
            'Explain casa.',
        );
    });

    it('rejects another thread or owner before reading or mutating application state', async () => {
        const { memory, storage } = fixture();
        const reading = vi.spyOn(memory.port, 'listMessages');
        const saving = vi.spyOn(memory.port, 'saveMessages');
        await expect(
            storage.listMessages({ threadId: 'other-conversation' }),
        ).rejects.toThrow('not authorized');
        await expect(
            storage.saveMessages({
                messages: [
                    toTutorModelMessage(
                        memory.messages.get('admitted-user')!,
                        'conversation-1',
                        'other-owner',
                    ),
                ],
            }),
        ).rejects.toThrow('not authorized');
        expect(reading).not.toHaveBeenCalled();
        expect(saving).not.toHaveBeenCalled();
    });

    it('does not allow the SDK to introduce a fabricated historical user message', async () => {
        const { memory, storage } = fixture();
        await expect(
            storage.saveMessages({
                messages: [
                    toTutorModelMessage(
                        {
                            id: 'invented-user',
                            role: 'user',
                            content: 'Invented permission.',
                            createdAt: '2026-10-19T00:00:00.000Z',
                        },
                        'conversation-1',
                        'owner-1',
                    ),
                ],
            }),
        ).rejects.toThrow('not authorized');
        expect(memory.messages.has('invented-user')).toBe(false);
    });
});
