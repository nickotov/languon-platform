import { expect, it } from 'vitest';
import { safeChatLink } from '../src/fsd/entities/conversation/lib/safe-chat-link';
it('allows explicit web links and rejects executable, relative and embedded content', () => {
    expect(safeChatLink('https://example.org/word')).toBe(
        'https://example.org/word',
    );
    for (const value of [
        'javascript:alert(1)',
        'data:text/html,test',
        '//example.org',
        '/admin',
        'mailto:a@example.org',
    ])
        expect(safeChatLink(value)).toBeUndefined();
});
