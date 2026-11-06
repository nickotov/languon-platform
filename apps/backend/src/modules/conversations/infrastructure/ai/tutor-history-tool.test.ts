import { describe, expect, it } from 'vitest';
import {
    createTutorHistoryTool,
    TutorHistoryInputSchema,
} from './tutor-history-tool';
import { tutorMemoryFixture } from './tutor-test-fixtures';

describe('authorized conversation history read', () => {
    it('does not accept model-selected owners, threads or arbitrary queries', () => {
        expect(() =>
            TutorHistoryInputSchema.parse({
                threadId: 'another-thread',
                limit: 5,
            }),
        ).toThrow();

        expect(() =>
            TutorHistoryInputSchema.parse({
                ownerId: 'another-owner',
                limit: 5,
            }),
        ).toThrow();
    });

    it('returns only visible current-thread wording and bounds complete-message results', async () => {
        const memory = tutorMemoryFixture([
            {
                id: 'first',
                role: 'user',
                content: 'Original wording.',
                modelContent: {
                    parts: [{ type: 'text', text: 'PRIVATE_TOOL_PAYLOAD' }],
                },
                createdAt: '2026-11-06T00:00:00Z',
            },
            {
                id: 'second',
                role: 'assistant',
                content: 'A'.repeat(24000),
                createdAt: '2026-11-06T00:01:00Z',
            },
        ]);
        const tool = createTutorHistoryTool(
            memory.port,
            new AbortController().signal,
        );
        const result = await tool.execute!({ limit: 5 }, {} as never);

        expect(JSON.stringify(result)).not.toContain('PRIVATE_TOOL_PAYLOAD');
        expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThan(24000);
        expect(result).toMatchObject({ total: 2, coverage: 'partial' });
    });
});
