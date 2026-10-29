import { describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { privateSentenceQuery } from '../../../../../src/modules/learning/infrastructure/persistence/drizzle/sentence-worker-jobs';
import type { SentenceTransaction } from '../../../../../src/modules/learning/infrastructure/persistence/drizzle/sentence-persistence-support';

describe('private sentence worker database failures', () => {
    it.each([
        new Error('Query parameters: synthetic-private-lease-secret'),
        {
            message: 'SQL driver rejected parameters',
            parameters: ['synthetic-private-lease-secret'],
        },
    ])(
        'does not expose driver-bound lease credentials in a propagated failure',
        async (driverFailure) => {
            const tx = {
                execute: vi.fn().mockRejectedValue(driverFailure),
            } as unknown as SentenceTransaction;
            const failure = await privateSentenceQuery(tx, sql`select 1`).catch(
                (error: unknown) => error,
            );
            expect(failure).toBeInstanceOf(Error);
            expect((failure as Error).message).toBe(
                'Private sentence worker authority failed.',
            );
            expect((failure as Error).cause).toBeUndefined();
            expect(String(failure)).not.toContain(
                'synthetic-private-lease-secret',
            );
        },
    );
});
