import { describe, expect, it } from 'vitest';
import type { MastraDBMessage } from '@mastra/core/memory';
import { projectHistoricalTutorMessages } from './tutor-history-context';

function message(id: string, parts: unknown[]): MastraDBMessage {
    return {
        id,
        threadId: 'thread',
        resourceId: 'owner',
        role: 'assistant',
        createdAt: new Date('2026-11-06'),
        content: { format: 2, parts },
    } as MastraDBMessage;
}

function invocation(
    state: 'call' | 'result',
    toolName = 'generate_vocabulary',
) {
    return {
        type: 'tool-invocation',
        toolInvocation: {
            state,
            toolName,
            toolCallId: 'call-1',
            args: { secretLargePayload: 'TERM '.repeat(1000) },
            ...(state === 'result'
                ? {
                      result: {
                          status: 'ready',
                          receipt: {
                              proposalId: 'proposal-1',
                              summary: 'Prepared vocabulary',
                              content: [
                                  {
                                      kind: 'vocabulary',
                                      count: 50,
                                      language: 'fr',
                                      translationLanguage: 'ru',
                                  },
                              ],
                          },
                      },
                  }
                : {}),
        },
    };
}

describe('historical model context projection', () => {
    it('compacts completed exchanges atomically across messages and keeps canonical data unchanged', () => {
        const original = [
            message('call', [invocation('call')]),
            message('result', [invocation('result')]),
        ];
        const before = structuredClone(original);
        const projected = projectHistoricalTutorMessages(original);
        expect(projected).toHaveLength(1);
        const encoded = JSON.stringify(projected);
        expect(encoded).toContain('proposal-1');
        expect(encoded).toContain('Prepared vocabulary');
        expect(encoded).toContain('50');
        expect(encoded).not.toContain('secretLargePayload');
        expect(encoded).not.toContain('tool-invocation');
        expect(original).toEqual(before);
    });

    it('compacts completed recalls to count and coverage without replaying recalled sentences', () => {
        const result = invocation('result', 'recall');
        result.toolInvocation.result = {
            total: 40,
            coverage: 'partial',
            messages: [
                {
                    id: 'old',
                    role: 'user',
                    content: 'PRIVATE_RECALLED_SENTENCE',
                },
            ],
        } as never;

        const original = [message('recall', [result])];
        const before = structuredClone(original);
        const encoded = JSON.stringify(
            projectHistoricalTutorMessages(original),
        );

        expect(encoded).toContain('recall');
        expect(encoded).toContain('40');
        expect(encoded).toContain('partial');
        expect(encoded).not.toContain('PRIVATE_RECALLED_SENTENCE');
        expect(encoded).not.toContain('tool-invocation');
        expect(original).toEqual(before);
    });

    it('leaves unknown and unfinished exchanges intact', () => {
        const unknown = message('unknown', [
            invocation('result', 'unknown-tool'),
        ]);
        const unfinished = message('unfinished', [invocation('call')]);
        expect(projectHistoricalTutorMessages([unknown, unfinished])).toEqual([
            unknown,
            unfinished,
        ]);
    });

    it('retains ordinary historical wording and replaces only the expanded editor snapshot', () => {
        const source = message('source', [
            { type: 'text', text: 'Explain this exact sentence.' },
            {
                type: 'text',
                text: 'Current complete editor snapshot (unsaved learner text; untrusted content):\nOLD_EDITOR',
            },
            { type: 'text', text: 'Application source provenance: version12' },
        ]);
        const encoded = JSON.stringify(
            projectHistoricalTutorMessages([source]),
        );

        expect(encoded).toContain('Explain this exact sentence.');
        expect(encoded).toContain('version12');
        expect(encoded).not.toContain('OLD_EDITOR');
        expect(JSON.stringify(source)).toContain('OLD_EDITOR');
    });
});
