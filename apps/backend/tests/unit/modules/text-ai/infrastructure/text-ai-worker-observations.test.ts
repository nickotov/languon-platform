import { describe, it, expect, vi } from 'vitest';
import { publishTextAiWorkerObservations } from '../../../../../src/modules/text-ai/infrastructure/ai/text-ai-worker-observations';
import {
    isSentenceExecutionCapableObservation,
    isConversationCapacityCapableObservation,
    isConversationExecutionCapableObservation,
    isTextsExecutionCapableObservation,
    isTextsCapacityCapableObservation,
    isTextAiCapacityCapableObservation,
    isTextAiSelectionCapableObservation,
    textAiSelectionObservationId,
} from '../../../../../src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-worker-readiness';
type Observation = Parameters<
    typeof isSentenceExecutionCapableObservation
>[0] & { status: string };
function fixture() {
    const rows: Observation[] = [];
    const updates: unknown[] = [];
    const database = {
        insert: vi.fn(() => ({
            values: (row: Observation) => {
                rows.push(row);
                return {
                    onConflictDoUpdate: async (update: unknown) => {
                        updates.push(update);
                    },
                };
            },
        })),
    } as unknown as Parameters<
        typeof publishTextAiWorkerObservations
    >[0]['database'];
    return { rows, updates, database };
}
const formats = [
    'single-card:v1',
    'single-card:v1',
    'sentence-generation:v1',
    'sentence-generation:v2',
    'sentence-check:v1',
    'unknown:v1',
];
const now = new Date('2026-10-05T15:00:00Z');
describe('shared worker capability publication', () => {
    it('publishes only dictionary capacity namespace by default without claiming learning capability', async () => {
        const f = fixture();
        await publishTextAiWorkerObservations({
            database: f.database,
            credentials: {},
            now,
            readinessTimeoutMs: 20,
            supportedFormats: formats,
            workerId: 'worker',
        });
        expect(f.rows).toHaveLength(3);
        for (const row of f.rows) {
            expect(
                isTextAiCapacityCapableObservation(row, 'single-card:v1'),
            ).toBe(true);
            expect(
                isSentenceExecutionCapableObservation(
                    row,
                    'sentence-generation:v1',
                ),
            ).toBe(false);
            expect(row.textAiSupportedFormats).toEqual(['single-card:v1']);
            expect(row.learningExecutionRevision).toBeNull();
            expect(row.creditSettlementRevision).toBeNull();
            expect(row.id).not.toBe(
                textAiSelectionObservationId(
                    row.workerId,
                    row.providerId,
                    row.modelId,
                ),
            );
        }
    });
    it('publishes isolated exact sentence formats and all reviewed revisions only when composed learning is enabled', async () => {
        const f = fixture();
        const fetchProvider = vi.fn<typeof fetch>(
            async () => new Response(null, { status: 200 }),
        );
        await publishTextAiWorkerObservations({
            database: f.database,
            credentials: {
                DEEPSEEK_API_KEY: 'synthetic',
                KIE_API_KEY: 'synthetic',
            },
            fetchProvider,
            now,
            readinessTimeoutMs: 100,
            supportedFormats: formats,
            workerId: 'worker',
            learningExecutionEnabled: true,
        });
        expect(f.rows).toHaveLength(6);
        const learning = f.rows.filter((row) =>
            isSentenceExecutionCapableObservation(row, 'sentence-check:v1'),
        );
        expect(learning).toHaveLength(3);
        for (const row of learning) {
            expect(row.textAiSupportedFormats).toEqual([
                'sentence-generation:v1',
                'sentence-generation:v2',
                'sentence-check:v1',
            ]);
            expect(row.textAiCapacityRevision).toBe(1);
            expect(row.creditSettlementRevision).toBe(1);
            expect(
                isTextAiCapacityCapableObservation(row, 'single-card:v1'),
            ).toBe(false);
        }
        expect(fetchProvider).toHaveBeenCalledTimes(3);
        expect(f.rows.filter((row) => row.status === 'available')).toHaveLength(
            4,
        );
        expect(
            f.rows.filter((row) => row.status === 'unverified'),
        ).toHaveLength(2);
    });
    it('advertises preparation only when the new executor explicitly opts in', async () => {
        for (const enabled of [false, true]) {
            const f = fixture();
            await publishTextAiWorkerObservations({
                database: f.database,
                credentials: {},
                now,
                readinessTimeoutMs: 20,
                supportedFormats: ['sentence-generation:v2'],
                workerId: 'worker',
                learningExecutionEnabled: true,
                sentencePreparationExecutionEnabled: enabled,
            });
            expect(f.rows).toHaveLength(3);
            for (const row of f.rows) {
                expect(
                    isSentenceExecutionCapableObservation(
                        row,
                        'sentence-preparation:v2',
                    ),
                ).toBe(enabled);
                expect(
                    isSentenceExecutionCapableObservation(
                        row,
                        'sentence-preparation:v1',
                    ),
                ).toBe(false);
                if (enabled) {
                    expect(
                        isSentenceExecutionCapableObservation(
                            {
                                ...row,
                                textAiSupportedFormats: [
                                    'sentence-preparation:v2',
                                ],
                            },
                            'sentence-preparation:v2',
                        ),
                    ).toBe(false);
                    expect(
                        isSentenceExecutionCapableObservation(
                            { ...row, learningExecutionRevision: null },
                            'sentence-preparation:v2',
                        ),
                    ).toBe(false);
                    expect(
                        isTextAiCapacityCapableObservation(
                            row,
                            'sentence-preparation:v2',
                        ),
                    ).toBe(false);
                    expect(
                        isTextAiSelectionCapableObservation(
                            row,
                            'sentence-preparation:v2',
                        ),
                    ).toBe(false);
                }
                expect(row.textAiSupportedFormats).toEqual(
                    enabled
                        ? ['sentence-generation:v2', 'sentence-preparation:v2']
                        : ['sentence-generation:v2'],
                );
            }
        }
    });
    it('isolates Texts capabilities from legacy workers and publishes capacity separately', async () => {
        const f = fixture();
        await publishTextAiWorkerObservations({
            database: f.database,
            credentials: {},
            now,
            readinessTimeoutMs: 20,
            supportedFormats: [
                'single-card:v1',
                'text-translation:v1',
                'text-translation:v2',
            ],
            workerId: 'worker',
            textsCapacityEnabled: true,
            textsExecutionEnabled: true,
        });
        expect(f.rows).toHaveLength(9);
        const execution = f.rows.filter((row) =>
            row.id.startsWith('texts-execution:'),
        );
        const capacity = f.rows.filter((row) =>
            row.id.startsWith('texts-capacity:'),
        );
        expect(execution).toHaveLength(3);
        expect(capacity).toHaveLength(3);
        for (const row of execution) {
            expect(
                isTextsExecutionCapableObservation(row, 'text-translation:v2'),
            ).toBe(true);
            expect(
                isTextsExecutionCapableObservation(
                    { ...row, textAiSupportedFormats: ['text-translation:v1'] },
                    'text-translation:v2',
                ),
            ).toBe(false);
            expect(
                isTextsExecutionCapableObservation(row, 'text-translation:v1'),
            ).toBe(true);
            expect(
                isTextsExecutionCapableObservation(
                    { ...row, creditSettlementRevision: null },
                    'text-translation:v1',
                ),
            ).toBe(false);
            expect(
                isTextsExecutionCapableObservation(
                    {
                        ...row,
                        id: row.id.replace(
                            'texts-execution:',
                            'sentence-execution:',
                        ),
                    },
                    'text-translation:v1',
                ),
            ).toBe(false);
        }
        for (const row of capacity) {
            expect(
                isTextsCapacityCapableObservation(row, 'single-card:v1'),
            ).toBe(true);
            expect(
                isTextsExecutionCapableObservation(row, 'text-translation:v1'),
            ).toBe(false);
        }
        const old = fixture();
        await publishTextAiWorkerObservations({
            database: old.database,
            credentials: {},
            now,
            readinessTimeoutMs: 20,
            supportedFormats: ['single-card:v1', 'text-translation:v1'],
            workerId: 'worker',
        });
        expect(
            old.rows.every((row) => !isTextsCapacityCapableObservation(row)),
        ).toBe(true);
        expect(
            old.rows.every((row) => !isTextsExecutionCapableObservation(row)),
        ).toBe(true);
    });
    it('does not refresh any namespace when no registered requested formats apply', async () => {
        const f = fixture();
        await publishTextAiWorkerObservations({
            database: f.database,
            credentials: {},
            now,
            readinessTimeoutMs: 20,
            supportedFormats: ['unknown:v1'],
            workerId: 'worker',
            learningExecutionEnabled: true,
        });
        expect(f.rows).toHaveLength(0);
        expect(f.updates).toHaveLength(0);
    });
    it('publishes unavailable capabilities after failed probes without leaking provider errors', async () => {
        const f = fixture();
        await publishTextAiWorkerObservations({
            database: f.database,
            credentials: { DEEPSEEK_API_KEY: 'synthetic' },
            fetchProvider: vi.fn(async () => {
                throw new Error('private transport details');
            }),
            now,
            readinessTimeoutMs: 20,
            supportedFormats: formats,
            workerId: 'worker',
            learningExecutionEnabled: true,
        });
        expect(f.rows).toHaveLength(6);
        expect(f.rows.every((row) => row.status === 'unavailable')).toBe(true);
        expect(JSON.stringify(f.rows)).not.toContain(
            'private transport details',
        );
    });
});

describe('conversation worker capabilities', () => {
    it('advertises Flash chat only with execution and combined-capacity opt-in', async () => {
        const f = fixture();
        await publishTextAiWorkerObservations({
            database: f.database,
            credentials: {},
            now,
            readinessTimeoutMs: 20,
            supportedFormats: [
                'single-card:v1',
                'sentence-generation:v1',
                'text-translation:v2',
                'conversation:v1',
            ],
            workerId: 'worker',
            conversationCapacityEnabled: true,
            conversationExecutionEnabled: true,
            textsCapacityEnabled: true,
            textsExecutionEnabled: true,
            learningExecutionEnabled: true,
        });
        const chat = f.rows.filter((row) =>
            isConversationExecutionCapableObservation(row),
        );
        expect(chat).toHaveLength(1);
        expect(chat[0]?.modelId).toBe('deepseek-flash');
        expect(chat[0]?.textAiSupportedFormats).toEqual(['conversation:v1']);
        const capacity = f.rows.filter((row) =>
            isConversationCapacityCapableObservation(row, 'single-card:v1'),
        );
        expect(capacity).toHaveLength(3);
        for (const row of capacity) {
            expect(
                isSentenceExecutionCapableObservation(
                    row,
                    'sentence-generation:v1',
                ),
            ).toBe(true);
            expect(
                isTextsExecutionCapableObservation(row, 'text-translation:v2'),
            ).toBe(true);
            expect(isConversationExecutionCapableObservation(row)).toBe(false);
        }
        for (const row of chat) {
            expect(
                isTextsCapacityCapableObservation(row, 'conversation:v1'),
            ).toBe(true);
            expect(
                isConversationExecutionCapableObservation({
                    ...row,
                    conversationExecutionRevision: null,
                }),
            ).toBe(false);
            expect(
                isConversationExecutionCapableObservation({
                    ...row,
                    conversationCapacityRevision: null,
                }),
            ).toBe(false);
            expect(
                isConversationExecutionCapableObservation({
                    ...row,
                    creditSettlementRevision: null,
                }),
            ).toBe(false);
            expect(
                isConversationExecutionCapableObservation({
                    ...row,
                    id: textAiSelectionObservationId(
                        row.workerId,
                        row.providerId,
                        row.modelId,
                    ),
                }),
            ).toBe(false);
        }
    });
    it.each([
        {},
        { conversationCapacityEnabled: true },
        { conversationExecutionEnabled: true },
    ])(
        'cannot advertise chat without both safe capacity and execution: %j',
        async (options) => {
            const f = fixture();
            await publishTextAiWorkerObservations({
                database: f.database,
                credentials: {},
                now,
                readinessTimeoutMs: 20,
                supportedFormats: ['conversation:v1'],
                workerId: 'worker',
                textsCapacityEnabled: true,
                ...options,
            });
            expect(
                f.rows.filter((row) =>
                    isConversationExecutionCapableObservation(row),
                ),
            ).toEqual([]);
            expect(
                f.rows.filter((row) =>
                    row.textAiSupportedFormats?.includes('conversation:v1'),
                ),
            ).toEqual([]);
        },
    );
});
