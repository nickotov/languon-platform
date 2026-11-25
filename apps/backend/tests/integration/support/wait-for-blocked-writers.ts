import type { PostgresClient } from '@languon/database';
import { expect, vi } from 'vitest';

export async function waitForBlockedWriters(
    client: PostgresClient,
    expected: number,
) {
    await vi.waitFor(
        async () => {
            const [state] =
                await client`select count(*)::integer as waiting from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock'`;

            expect(state?.waiting).toBeGreaterThanOrEqual(expected);
        },
        { timeout: 8_000 },
    );
}
