import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../database/schema';
import { cleanupTextAiCapacity, lockTextAiCapacity } from './text-ai-capacity';

/** Small operational batches on a dedicated connection; never awaited by admission. */
export async function maintainTextAiAccounting(
    database: PostgresJsDatabase<typeof databaseSchema>,
    now = new Date(),
): Promise<void> {
    await database.transaction(async (tx) => {
        await tx.execute(sql`set local lock_timeout='50ms'`);
        await tx.execute(sql`set local statement_timeout='100ms'`);
        await lockTextAiCapacity(tx);
        const cutoff = new Date(now.getTime() - 86_400_000).toISOString();
        await tx.execute(sql`delete from dictionary_generation_provider_usage_archive
            where ctid in (select ctid from dictionary_generation_provider_usage_archive
                where settled_at<=${cutoff}::timestamptz order by settled_at limit 25)`);
        await cleanupTextAiCapacity(tx, now, 25);
    });
}

export function startAccountingMaintenance(options: {
    maintain(): Promise<void>;
    onError(error: unknown): void;
    intervalMs?: number;
}): { stop(): Promise<void> } {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending = Promise.resolve();
    const schedule = () => {
        if (stopped) return;
        timer = setTimeout(() => {
            pending = options
                .maintain()
                .catch(options.onError)
                .finally(schedule);
        }, options.intervalMs ?? 1000);
        timer.unref();
    };
    schedule();
    return {
        async stop() {
            stopped = true;
            if (timer) clearTimeout(timer);
            await pending;
        },
    };
}
