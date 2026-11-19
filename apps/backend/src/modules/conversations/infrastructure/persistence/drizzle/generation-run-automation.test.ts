import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConversationPersistenceContext } from './conversation-persistence-context';
import { admitAutomaticGeneration } from './generation-run-automation';

const { submit, transaction } = vi.hoisted(() => ({
    submit: vi.fn(),
    transaction: vi.fn(),
}));

vi.mock('./conversation-turn-admission', () => ({
    conversationSubmit: submit,
}));

vi.mock('./conversation-persistence-authority', () => ({
    conversationTransaction: transaction,
}));

const id = (last: string) => `00000000-0000-4000-8000-00000000000${last}`;
const candidate = (id: string) => ({
    id,
    revision: 1,
    automation: {
        authorizationId: id,
        stageCount: 1,
        expiresAt: '2026-01-01T00:15:00Z',
        ready: true,
    },
});

function fixture(rows: unknown[]) {
    const limit = vi.fn().mockResolvedValue(rows);
    const whereUpdate = vi.fn().mockResolvedValue([]);
    const set = vi.fn(() => ({ where: whereUpdate }));
    const database = {
        select: () => ({
            from: () => ({ where: () => ({ orderBy: () => ({ limit }) }) }),
        }),
        update: () => ({ set }),
    };

    return {
        limit,
        set,
        whereUpdate,
        persistence: {
            dependencies: { database },
            now: () => new Date('2026-01-01T00:00:00Z'),
        } as unknown as ConversationPersistenceContext,
    };
}

describe('automatic admission candidate isolation', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.clearAllMocks();
    });

    it.each([true, false])(
        'attempts later candidates despite failed outcome persistence; quarantine available %p',
        async (available) => {
            const first = candidate(id('1')),
                second = candidate(id('2'));
            const { persistence, set, whereUpdate } = fixture([first, second]);
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            submit
                .mockRejectedValueOnce(new Error('untrusted provider text'))
                .mockResolvedValueOnce({});

            transaction.mockRejectedValueOnce(
                new Error('event publication failed with private data'),
            );

            if (!available) {
                whereUpdate.mockRejectedValueOnce(
                    new Error('quarantine unavailable'),
                );
            }

            await expect(
                admitAutomaticGeneration(persistence),
            ).resolves.toEqual([
                { runId: first.id, code: 'automatic_admission_failed' },
                { runId: second.id, code: 'admitted' },
            ]);

            expect(set).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({
                    automation: null,
                    failure: {
                        code: 'admission-blocked',
                        admissionReason: 'unknown',
                        referenceId: expect.any(String),
                    },
                }),
            );

            expect(warn.mock.calls.map((call) => call[1].phase)).toEqual(
                available
                    ? ['admit', 'record-outcome']
                    : ['admit', 'record-outcome', 'quarantine'],
            );

            expect(JSON.stringify(warn.mock.calls)).not.toMatch(
                /untrusted|private data/,
            );
        },
    );

    it('propagates a discovery failure so worker health exposes a global outage', async () => {
        const { persistence, limit } = fixture([]);
        const outage = new Error('database unavailable');
        limit.mockRejectedValueOnce(outage);
        await expect(admitAutomaticGeneration(persistence)).rejects.toBe(
            outage,
        );

        expect(submit).not.toHaveBeenCalled();
    });
});
