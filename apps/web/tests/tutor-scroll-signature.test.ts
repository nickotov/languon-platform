import { expect, it } from 'vitest';
import type { ConversationUIMessage } from '@/fsd/entities/conversation';
import { messageScrollSignature } from '../src/fsd/widgets/contextual-assistant/lib/message-scroll-signature';

it('observes streamed growth and drafts without reading old message bodies', () => {
    const old: ConversationUIMessage = {
        id: 'old',
        role: 'assistant',
        get parts() {
            throw new Error(
                'Old bodies must not be inspected for scroll updates',
            );
        },
    };
    const last: ConversationUIMessage = {
        id: 'new',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Hello' }],
    };
    const history = [...Array<ConversationUIMessage>(10_000).fill(old), last];
    const before = messageScrollSignature(history, 0);
    last.parts = [{ type: 'text', text: 'Hello world' }];
    expect(messageScrollSignature(history, 0)).not.toBe(before);
    expect(messageScrollSignature(history, 1)).not.toBe(
        messageScrollSignature(history, 0),
    );
    expect(messageScrollSignature([], 0)).not.toBe(before);
});
