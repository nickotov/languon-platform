import { describe, expect, it } from 'vitest';
import {
    tutorAdmissionInputBytes,
    tutorReservedInputBytes,
} from './tutor-context-budget';

const context = {
    message: {
        id: 'fixture',
        role: 'user' as const,
        content: 'Explain hola.',
        createdAt: '2026-10-22T00:00:00Z',
    },
    sourceContext: { title: 'Synthetic source' },
    preferences: {
        mode: 'auto' as const,
        replyLanguage: 'auto' as const,
        tone: 'neutral' as const,
        explanationLevel: 'auto' as const,
    },
};
describe('conversation admitted input budget', () => {
    it('bounds a short new prompt using real framing instead of the model context maximum', () => {
        const bound = tutorAdmissionInputBytes(context, [], []);
        expect(bound).toBeGreaterThan(tutorReservedInputBytes(context) + 4096);
        expect(bound).toBeLessThan(64000);
    });
    it('includes retained source, history and memory bytes before dispatch', () => {
        const initial = tutorAdmissionInputBytes(context, [], []);
        const expanded = tutorAdmissionInputBytes(
            {
                ...context,
                sourceContext: {
                    title: 'Synthetic source',
                    text: '界'.repeat(1000),
                },
            },
            [{ text: 'history'.repeat(1000) }],
            [{ observations: 'memory'.repeat(1000) }],
        );
        expect(expanded - initial).toBeGreaterThan(15000);
    });
});
