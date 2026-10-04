import { describe, it, expect, vi } from 'vitest';
import { publishTextAiWorkerObservations } from '../../../../../src/modules/text-ai/infrastructure/ai/text-ai-worker-observations';
import {
    isSentenceExecutionCapableObservation,
    isTextAiCapacityCapableObservation,
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
        expect(f.rows).toHaveLength(2);
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
        expect(f.rows).toHaveLength(4);
        const learning = f.rows.filter((row) =>
            isSentenceExecutionCapableObservation(row, 'sentence-check:v1'),
        );
        expect(learning).toHaveLength(2);
        for (const row of learning) {
            expect(row.textAiSupportedFormats).toEqual([
                'sentence-generation:v1',
                'sentence-check:v1',
            ]);
            expect(row.textAiCapacityRevision).toBe(1);
            expect(row.creditSettlementRevision).toBe(1);
            expect(
                isTextAiCapacityCapableObservation(row, 'single-card:v1'),
            ).toBe(false);
        }
        expect(fetchProvider).toHaveBeenCalledTimes(2);
        expect(f.rows.filter((row) => row.status === 'available')).toHaveLength(
            2,
        );
        expect(
            f.rows.filter((row) => row.status === 'unverified'),
        ).toHaveLength(2);
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
        expect(f.rows).toHaveLength(4);
        expect(f.rows.every((row) => row.status === 'unavailable')).toBe(true);
        expect(JSON.stringify(f.rows)).not.toContain(
            'private transport details',
        );
    });
});
