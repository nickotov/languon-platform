import {
    withTextAiProviderAttemptWitness,
    currentTextAiProviderAttemptWitness,
} from '../../../../src/modules/text-ai/infrastructure/ai/text-ai-provider-attempt-context';
import { describe, expect, it, vi } from 'vitest';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { createTextAiRouteHealthRecorder } from '../../../../src/modules/text-ai/infrastructure/ai/text-ai-route-health';

function fixture() {
    const execute = vi.fn(async (_query: unknown) => []);
    const rawRecord = createTextAiRouteHealthRecorder({
        execute,
    } as unknown as PostgresJsDatabase<typeof databaseSchema>);
    return {
        execute,
        rawRecord,
        record: (event: Parameters<typeof rawRecord>[0]) =>
            withTextAiProviderAttemptWitness(
                {
                    attemptId: '00000000-0000-4000-8000-000000000001',
                    jobId: '00000000-0000-4000-8000-000000000002',
                    workerId: 'worker',
                    fencingToken: '1',
                },
                () => rawRecord(event),
            ),
    };
}

const identity = {
    routeId: 'deepseek/deepseek-flash',
    flowId: 'sentence-check',
    fingerprint: 'a'.repeat(64),
};
describe('runtime route health observation boundary', () => {
    it('does not let caller-triggered 403 policy refusals disable credentials', async () => {
        const { record, execute } = fixture();
        await record({
            ...identity,
            failure: { reason: 'authorization_failed', httpStatus: 403 },
        });
        await record({
            ...identity,
            failure: { reason: 'provider_unavailable', providerCode: 403 },
        });
        expect(execute).not.toHaveBeenCalled();
    });
    it('records positive authentication failure and explicit schema incompatibility', async () => {
        const { record, execute } = fixture();
        await record({
            ...identity,
            failure: { reason: 'authorization_failed', httpStatus: 401 },
        });
        await record({
            ...identity,
            reason: 'schema_incompatible',
            failure: { reason: 'schema_incompatible', httpStatus: 400 },
        });
        expect(execute).toHaveBeenCalledTimes(2);
    });
    it('rejects unreviewed routes and malformed fingerprints before writes', async () => {
        const { record, execute } = fixture();
        await expect(
            record({
                ...identity,
                routeId: 'evil/model',
                failure: { reason: 'model_retired' },
            }),
        ).rejects.toThrow('Unreviewed route');
        await expect(
            record({
                ...identity,
                fingerprint: 'key-material',
                failure: { reason: 'model_retired' },
            }),
        ).rejects.toThrow();
        expect(execute).not.toHaveBeenCalled();
    });
    it('does not swallow persistence failure and silently authorize a follow-up call', async () => {
        const { record, execute } = fixture();
        execute.mockRejectedValueOnce(
            new Error('Health persistence unavailable.'),
        );
        await expect(
            record({ ...identity, failure: { reason: 'model_retired' } }),
        ).rejects.toThrow('Health persistence unavailable.');
    });
    it('records generic HTTP400 as request rejection rather than shared-route unavailability', async () => {
        const { record, execute } = fixture();
        await record({
            ...identity,
            failure: { reason: 'provider_unavailable', httpStatus: 400 },
        });
        const query = execute.mock.calls[0]?.[0] as unknown as {
            queryChunks: Array<unknown>;
        };
        expect(execute).toHaveBeenCalledOnce();
        expect(JSON.stringify(query)).toContain('request_rejected');
    });
    it('requires a current admitted attempt witness and isolates concurrent operations', async () => {
        const { rawRecord, execute } = fixture();
        await expect(
            rawRecord({ ...identity, failure: { reason: 'model_retired' } }),
        ).rejects.toThrow('admitted attempt witness');
        expect(execute).not.toHaveBeenCalled();
        const a = {
            attemptId: '00000000-0000-4000-8000-000000000001',
            jobId: '00000000-0000-4000-8000-000000000002',
            workerId: 'a',
            fencingToken: '1',
        };
        const b = {
            ...a,
            attemptId: '00000000-0000-4000-8000-000000000003',
            workerId: 'b',
        };
        const observations = await Promise.all([
            withTextAiProviderAttemptWitness(a, async () => {
                await Promise.resolve();
                return currentTextAiProviderAttemptWitness();
            }),
            withTextAiProviderAttemptWitness(b, async () => {
                await Promise.resolve();
                return currentTextAiProviderAttemptWitness();
            }),
        ]);
        expect(observations).toEqual([a, b]);
        expect(currentTextAiProviderAttemptWitness()).toBeUndefined();
    });
});
