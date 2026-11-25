import type { PostgresJsDatabase } from '@languon/database';
import { sql } from 'drizzle-orm';
import type { databaseSchema } from '../../../../../infrastructure/database/schema';

/** Each API replica ticks independently. Only one batch runs across all replicas at a time. */
export function pruneExpiredSecurityEvents(
    database: PostgresJsDatabase<typeof databaseSchema>,
) {
    return database.transaction(async (tx) => {
        const [lock] = await tx.execute<{ acquired: boolean }>(
            sql`select pg_try_advisory_xact_lock(hashtextextended('languon.auth-security-event-retention',0)) as acquired`,
        );

        if (!lock?.acquired) {
            return;
        }

        await tx.execute(sql`set local lock_timeout='100ms'`);
        await tx.execute(sql`set local statement_timeout='1s'`);
        await tx.execute(sql`
            delete from auth_security_events
            where expires_at <= current_timestamp and id in (
                select id from auth_security_events
                where expires_at <= current_timestamp
                order by expires_at limit 500
            )`);

        // Monitoring needs the oldest overdue age only. The expiry index supports both reads.
        const [oldest] = await tx.execute<{ seconds: number }>(sql`
            select floor(extract(epoch from current_timestamp - expires_at))::double precision as seconds
            from auth_security_events where expires_at <= current_timestamp
            order by expires_at limit 1`);

        return oldest?.seconds;
    });
}
