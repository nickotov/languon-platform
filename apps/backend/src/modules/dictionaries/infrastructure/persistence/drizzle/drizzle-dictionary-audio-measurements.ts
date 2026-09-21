import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import {
    sanitizeAudioMeasurement,
    type DictionaryAudioMeasurement,
} from '../../../application/ports/dictionary-audio-measurement';

export class DrizzleDictionaryAudioMeasurements {
    constructor(
        private readonly database: PostgresJsDatabase<typeof databaseSchema>,
    ) {}

    async observe(input: {
        signal: AbortSignal;
        now: Date;
    }): Promise<DictionaryAudioMeasurement> {
        input.signal.throwIfAborted();
        const now = input.now.toISOString();
        const midnight = new Date(input.now);
        midnight.setUTCHours(0, 0, 0, 0);
        const [row] = await this.database.execute(sql`
            with cleanup as (
                select a.created_at from dictionary_audio_assets a
                join dictionary_audio_jobs j on j.asset_id=a.id
                where (a.writer_expires_at is null or a.writer_expires_at <= ${now}::timestamptz)
                and (j.lease_expires_at is null or j.lease_expires_at <= ${now}::timestamptz)
                and (a.state='deleting' or (j.state in ('ready','failed','cancelled') and (
                    a.last_accessed_at <= ${now}::timestamptz - interval '30 days' or
                    (a.created_at <= ${now}::timestamptz - interval '1 day' and not exists (
                        select 1 from dictionary_audio_bindings b where b.job_id=j.id
                    ))
                )))
            )
            select
                count(*) filter (where state='queued') as queued,
                count(*) filter (where state='submitting') as submitting,
                count(*) filter (where state='waiting_provider') as waiting,
                count(*) filter (where state='storing') as storing,
                count(*) filter (where state='submission_unknown') as unknown,
                count(*) filter (where lease_expires_at > ${now}::timestamptz) as leased,
                coalesce(sum(reserved_cost) filter (where created_at >= ${midnight.toISOString()}::timestamptz),0) as reserved,
                (select count(*) from cleanup) as cleanup_count,
                (select coalesce(floor(extract(epoch from (${now}::timestamptz-min(created_at)))*1000),0) from cleanup) as cleanup_age
            from dictionary_audio_jobs
        `);
        input.signal.throwIfAborted();
        return sanitizeAudioMeasurement({
            schemaVersion: 1,
            queueQueuedCount: Number(row?.queued),
            queueSubmittingCount: Number(row?.submitting),
            queueWaitingProviderCount: Number(row?.waiting),
            queueStoringCount: Number(row?.storing),
            submissionUnknownCount: Number(row?.unknown),
            liveLeaseCount: Number(row?.leased),
            reservedDailyCostUnits: Number(row?.reserved),
            cleanupPendingCount: Number(row?.cleanup_count),
            cleanupOldestAgeMs: Math.max(0, Number(row?.cleanup_age)),
        });
    }
}
