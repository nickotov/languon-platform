import { createHmac, randomUUID } from 'node:crypto';
import { audioJobStateAfterOwnerInterruption } from '../../../domain/audio';
import { and, eq, gt, inArray, lte, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from '@languon/database';
import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import type {
    AudioBudget,
    AudioIdentity,
    AudioJob,
    DictionaryAudioStore,
} from '../../../application/ports/dictionary-audio-store';
import {
    DictionaryCardNotFoundError,
    DictionaryRateLimitError,
    DictionaryVersionConflictError,
} from '../../../application/dictionary-errors';
import {
    dictionaryAudioAssetsTable as assets,
    dictionaryAudioBindingsTable as bindings,
    dictionaryAudioJobsTable as jobs,
} from './audio-schema';
import {
    dictionariesTable,
    dictionaryCardsTable,
    dictionarySettingsTable,
} from './schema';

export class DrizzleDictionaryAudioStore implements DictionaryAudioStore {
    constructor(
        private readonly database: PostgresJsDatabase<typeof databaseSchema>,
        private readonly fingerprintSecret?: string | Uint8Array,
    ) {}
    async find(identity: AudioIdentity) {
        const [row] = await this.database
            .select({ job: jobs, asset: assets })
            .from(bindings)
            .innerJoin(jobs, eq(bindings.jobId, jobs.id))
            .innerJoin(assets, eq(jobs.assetId, assets.id))
            .where(
                and(
                    eq(bindings.ownerId, identity.ownerId),
                    eq(bindings.cardId, identity.cardId),
                    eq(bindings.field, identity.field),
                    eq(bindings.fingerprint, identity.fingerprint),
                ),
            );
        if (row?.asset.state === 'deleting') return null;
        if (row)
            await this.database
                .update(assets)
                .set({ lastAccessedAt: new Date() })
                .where(
                    and(
                        eq(assets.id, row.asset.id),
                        sql`${assets.state} != 'deleting'`,
                    ),
                );
        return row ?? null;
    }
    async enqueue(input: Parameters<DictionaryAudioStore['enqueue']>[0]) {
        return this.database.transaction(async (tx) => {
            // A single short admission lock makes owner/global reservations atomic.
            await tx.execute(sql`select pg_advisory_xact_lock(76021941)`);
            await tx.execute(
                sql`select pg_advisory_xact_lock(hashtextextended(${input.ownerId},76021941))`,
            );
            const owner = await tx.execute(
                sql`select id from users where id=${input.ownerId} and status='active'`,
            );
            if (!owner.length) throw new DictionaryCardNotFoundError();
            const current = await tx.execute(
                sql`select c.id from dictionary_cards c join dictionaries d on d.id=c.dictionary_id join dictionary_settings s on s.dictionary_id=d.id where c.id=${input.cardId} and d.id=${input.dictionaryId} and d.owner_id=${input.ownerId} and c.lifecycle='active' and d.lifecycle='active' and c.version=${input.cardVersion} and s.version=${input.settingsVersion} for share of c,d,s`,
            );
            if (!current.length) throw new DictionaryVersionConflictError();
            const [existing] = await tx
                .select({ job: jobs, asset: assets })
                .from(bindings)
                .innerJoin(jobs, eq(bindings.jobId, jobs.id))
                .innerJoin(assets, eq(jobs.assetId, assets.id))
                .where(
                    and(
                        eq(bindings.ownerId, input.ownerId),
                        eq(bindings.cardId, input.cardId),
                        eq(bindings.field, input.field),
                        eq(bindings.fingerprint, input.fingerprint),
                    ),
                );
            if (
                existing &&
                !['failed', 'cancelled'].includes(existing.job.state) &&
                existing.asset.state !== 'deleting'
            )
                return existing;
            if (existing)
                await tx
                    .delete(bindings)
                    .where(eq(bindings.jobId, existing.job.id));
            const midnight = new Date(input.now);
            midnight.setUTCHours(0, 0, 0, 0);
            const rows = await tx
                .select({
                    ownerId: jobs.ownerId,
                    cost: jobs.reservedCost,
                    state: jobs.state,
                    createdAt: jobs.createdAt,
                })
                .from(jobs)
                .where(
                    sql`${jobs.createdAt} >= ${midnight.toISOString()} or (${jobs.createdAt} > ${new Date(input.now.getTime() - 86400000).toISOString()} and ${jobs.state} in ('queued','submitting','waiting_provider','storing','submission_unknown'))`,
                );
            const cost = Math.ceil(
                [...input.text].length *
                    input.profile.estimatedCostUnitsPerCharacter,
            );
            if (
                [...input.text].length > (input.budget.maxCharacters ?? 2000) ||
                cost >
                    (input.budget.maxCostPerClip ?? input.budget.ownerDailyCost)
            )
                throw new DictionaryRateLimitError(60);
            const owned = rows.filter((row) => row.ownerId === input.ownerId);
            if (
                !Number.isSafeInteger(cost) ||
                cost < 0 ||
                rows.reduce(
                    (n, row) => n + (row.createdAt >= midnight ? row.cost : 0),
                    0,
                ) +
                    cost >
                    input.budget.globalDailyCost ||
                owned.reduce(
                    (n, row) => n + (row.createdAt >= midnight ? row.cost : 0),
                    0,
                ) +
                    cost >
                    input.budget.ownerDailyCost ||
                owned.filter(
                    (row) =>
                        row.createdAt.getTime() >
                            input.now.getTime() - 86400000 &&
                        [
                            'queued',
                            'submitting',
                            'waiting_provider',
                            'storing',
                            'submission_unknown',
                        ].includes(row.state),
                ).length >= input.budget.ownerQueued
            )
                throw new DictionaryRateLimitError(60);
            const assetId = randomUUID(),
                jobId = randomUUID();
            const [asset] = await tx
                .insert(assets)
                .values({
                    id: assetId,
                    ownerId: input.ownerId,
                    dictionaryId: input.dictionaryId,
                    cardId: input.cardId,
                    field: input.field,
                    fingerprint: input.fingerprint,
                    storage: input.storage,
                    state: 'pending',
                    createdAt: input.now,
                    lastAccessedAt: input.now,
                })
                .returning();
            const [job] = await tx
                .insert(jobs)
                .values({
                    id: jobId,
                    ownerId: input.ownerId,
                    dictionaryId: input.dictionaryId,
                    cardId: input.cardId,
                    field: input.field,
                    fingerprint: input.fingerprint,
                    assetId,
                    text: input.text,
                    profile: input.profile,
                    state: 'queued',
                    cardVersion: input.cardVersion,
                    settingsVersion: input.settingsVersion,
                    nextPollAt: input.now,
                    deadlineAt: new Date(input.now.getTime() + 120000),
                    reservedCost: cost,
                    createdAt: input.now,
                })
                .returning();
            if (!asset || !job) throw new Error('Audio reservation failed.');
            await tx.insert(bindings).values({
                id: randomUUID(),
                ownerId: input.ownerId,
                cardId: input.cardId,
                field: input.field,
                fingerprint: input.fingerprint,
                jobId,
            });
            return { asset, job };
        });
    }
    async claim(now: Date, budget: AudioBudget, generationEnabled = true) {
        return this.database.transaction(async (tx) => {
            await tx.execute(sql`select pg_advisory_xact_lock(76021941)`);
            // A crashed submission cannot safely be submitted again.
            await tx
                .update(jobs)
                .set({
                    state: 'submission_unknown',
                    text: '',
                    error: 'submission_unknown',
                    leaseToken: null,
                    leaseExpiresAt: null,
                })
                .where(
                    and(
                        eq(jobs.state, 'submitting'),
                        lte(jobs.leaseExpiresAt, now),
                    ),
                );
            const candidates = await tx
                .select()
                .from(jobs)
                .where(
                    and(
                        inArray(
                            jobs.state,
                            generationEnabled
                                ? ['queued', 'waiting_provider', 'storing']
                                : ['waiting_provider', 'storing'],
                        ),
                        lte(jobs.nextPollAt, now),
                        sql`(${jobs.leaseExpiresAt} is null or ${jobs.leaseExpiresAt} <= ${now.toISOString()})`,
                    ),
                )
                .orderBy(jobs.createdAt)
                .limit(20);
            for (const job of candidates) {
                await tx.execute(
                    sql`select pg_advisory_xact_lock(hashtextextended(${job.ownerId},76021941))`,
                );
                const owner = await tx.execute(
                    sql`select id from users where id=${job.ownerId} and status='active'`,
                );
                if (!owner.length) {
                    await tx
                        .update(jobs)
                        .set({
                            state: audioJobStateAfterOwnerInterruption(
                                job.state,
                            ),
                            text: '',
                            error: 'owner_unavailable',
                        })
                        .where(eq(jobs.id, job.id));
                    continue;
                }
                if (job.state === 'queued') {
                    const current = await tx.execute(
                        sql`select c.id from dictionary_cards c join dictionaries d on d.id=c.dictionary_id join dictionary_settings s on s.dictionary_id=d.id where c.id=${job.cardId} and d.owner_id=${job.ownerId} and c.lifecycle='active' and d.lifecycle='active' and c.version=${job.cardVersion} and s.version=${job.settingsVersion}`,
                    );
                    if (!current.length) {
                        await tx
                            .update(jobs)
                            .set({
                                state: 'cancelled',
                                text: '',
                                error: 'content_changed',
                            })
                            .where(eq(jobs.id, job.id));
                        continue;
                    }
                    const active = await tx
                        .select({ ownerId: jobs.ownerId })
                        .from(jobs)
                        .where(
                            and(
                                gt(
                                    jobs.createdAt,
                                    new Date(now.getTime() - 86400000),
                                ),
                                inArray(jobs.state, [
                                    'submitting',
                                    'waiting_provider',
                                    'storing',
                                    'submission_unknown',
                                ]),
                            ),
                        );
                    if (
                        active.length >= budget.globalActive ||
                        active.filter((row) => row.ownerId === job.ownerId)
                            .length >= budget.ownerActive
                    )
                        continue;
                    if (job.deadlineAt <= now) {
                        await tx
                            .update(jobs)
                            .set({
                                state: 'failed',
                                error: 'generation_timeout',
                                text: '',
                            })
                            .where(eq(jobs.id, job.id));
                        continue;
                    }
                }
                const [claimed] = await tx
                    .update(jobs)
                    .set({
                        state:
                            job.state === 'queued' ? 'submitting' : job.state,
                        leaseToken: randomUUID(),
                        leaseExpiresAt: new Date(now.getTime() + 60000),
                    })
                    .where(eq(jobs.id, job.id))
                    .returning();
                return claimed ?? null;
            }
            return null;
        });
    }
    private fence(job: AudioJob, now: Date) {
        return and(
            eq(jobs.id, job.id),
            eq(jobs.leaseToken, job.leaseToken ?? ''),
            gt(jobs.leaseExpiresAt, now),
            inArray(jobs.state, ['submitting', 'waiting_provider', 'storing']),
        );
    }
    async transition(
        job: AudioJob,
        patch: Parameters<DictionaryAudioStore['transition']>[1],
        now: Date,
    ) {
        const rows = await this.database
            .update(jobs)
            .set({
                ...patch,
                ...(['failed', 'cancelled', 'submission_unknown'].includes(
                    patch.state ?? '',
                )
                    ? { text: '' }
                    : {}),
                leaseToken: null,
                leaseExpiresAt: null,
            })
            .where(this.fence(job, now))
            .returning({ id: jobs.id });
        return rows.length > 0;
    }
    async beginWrite(job: AudioJob, now: Date) {
        return this.database.transaction(async (tx) => {
            await tx.execute(
                sql`select pg_advisory_xact_lock(hashtextextended(${job.ownerId},76021941))`,
            );
            const owner = await tx.execute(
                sql`select id from users where id=${job.ownerId} and status='active'`,
            );
            if (!owner.length) return null;
            const guarded = await tx
                .update(jobs)
                .set({ state: 'storing' })
                .where(this.fence(job, now))
                .returning();
            if (!guarded.length) return null;
            const [asset] = await tx
                .update(assets)
                .set({ writerExpiresAt: new Date(now.getTime() + 90000) })
                .where(eq(assets.id, job.assetId))
                .returning();
            return asset ?? null;
        });
    }
    async complete(
        job: AudioJob,
        input: Parameters<DictionaryAudioStore['complete']>[1],
        now: Date,
    ) {
        return this.database.transaction(async (tx) => {
            await tx.execute(
                sql`select pg_advisory_xact_lock(hashtextextended(${job.ownerId},76021941))`,
            );
            const owner = await tx.execute(
                sql`select id from users where id=${job.ownerId} and status='active'`,
            );
            if (!owner.length) return false;
            const rows = await tx
                .update(jobs)
                .set({
                    state: 'ready',
                    error: null,
                    text: '',
                    leaseToken: null,
                    leaseExpiresAt: null,
                })
                .where(this.fence(job, now))
                .returning();
            if (!rows.length) return false;
            await tx
                .update(assets)
                .set({ ...input, state: 'ready' })
                .where(eq(assets.id, job.assetId));
            return true;
        });
    }
    async cleanupCandidate(now: Date, reconcile = true) {
        return this.database.transaction(async (tx) => {
            await tx.execute(sql`select pg_advisory_xact_lock(76021941)`);
            if (reconcile) {
                const midnight = new Date(now);
                midnight.setUTCHours(0, 0, 0, 0);
                const unknownCutoff = new Date(now.getTime() - 30 * 86400000);
                const expiredLedgers = await tx
                    .select({ id: jobs.id })
                    .from(jobs)
                    .where(
                        and(
                            sql`not exists(select 1 from dictionary_audio_assets a where a.id=${jobs.assetId})`,
                            sql`not exists(select 1 from dictionary_audio_bindings b where b.job_id=${jobs.id})`,
                            sql`((${jobs.state} in ('ready','failed','cancelled') and ${jobs.createdAt} < ${midnight.toISOString()}) or (${jobs.state}='submission_unknown' and ${jobs.createdAt}<${unknownCutoff.toISOString()}))`,
                        ),
                    )
                    .limit(100);
                if (expiredLedgers.length)
                    await tx.delete(jobs).where(
                        inArray(
                            jobs.id,
                            expiredLedgers.map((job) => job.id),
                        ),
                    );
                const horizon = new Date(now.getTime() - 86400000);
                await tx
                    .update(jobs)
                    .set({
                        state: 'failed',
                        text: '',
                        error: 'generation_timeout',
                    })
                    .where(
                        sql`${jobs.id} in (select id from dictionary_audio_jobs where state='queued' and created_at <= ${horizon.toISOString()} limit 100)`,
                    );
                // Stop automatic reconciliation after one day, retaining task identity
                // and the binding tombstone so another Play cannot double-submit.
                await tx
                    .update(jobs)
                    .set({
                        state: 'submission_unknown',
                        text: '',
                        error: 'reconciliation_required',
                        leaseToken: null,
                        leaseExpiresAt: null,
                    })
                    .where(
                        sql`${jobs.id} in (select id from dictionary_audio_jobs where state in ('waiting_provider','submitting') and created_at <= ${horizon.toISOString()} and (lease_expires_at is null or lease_expires_at <= ${now.toISOString()}) limit 100)`,
                    );
                // Storing is entered only after a provider returned complete audio.
                // Known asynchronous tasks can recover their existing output;
                // never turn missing publication into another paid submission.
                const expiredWriters = await tx
                    .select({
                        id: jobs.id,
                        ownerId: jobs.ownerId,
                        taskId: jobs.taskId,
                        createdAt: jobs.createdAt,
                    })
                    .from(jobs)
                    .innerJoin(assets, eq(jobs.assetId, assets.id))
                    .where(
                        and(
                            eq(jobs.state, 'storing'),
                            lte(assets.writerExpiresAt, now),
                            sql`(${jobs.leaseExpiresAt} is null or ${jobs.leaseExpiresAt} <= ${now.toISOString()})`,
                        ),
                    )
                    .limit(100);
                for (const job of expiredWriters) {
                    await tx.execute(
                        sql`select pg_advisory_xact_lock(hashtextextended(${job.ownerId},76021941))`,
                    );
                    const activeOwner = await tx.execute(
                        sql`select id from users where id=${job.ownerId} and status='active'`,
                    );
                    const state = !activeOwner.length
                        ? audioJobStateAfterOwnerInterruption('storing')
                        : job.taskId
                          ? job.createdAt <= horizon
                              ? 'submission_unknown'
                              : 'waiting_provider'
                          : 'failed';
                    await tx
                        .update(jobs)
                        .set({
                            state,
                            text: '',
                            error: 'publication_expired',
                            leaseToken: null,
                            leaseExpiresAt: null,
                            nextPollAt: now,
                        })
                        .where(
                            and(eq(jobs.id, job.id), eq(jobs.state, 'storing')),
                        );
                    if (state === 'failed')
                        await tx
                            .delete(bindings)
                            .where(eq(bindings.jobId, job.id));
                }
                if (this.fingerprintSecret) {
                    const stale = await tx
                        .select({
                            binding: bindings,
                            job: jobs,
                            card: {
                                id: dictionaryCardsTable.id,
                                version: dictionaryCardsTable.version,
                                lifecycle: dictionaryCardsTable.lifecycle,
                                source: dictionaryCardsTable.source,
                                translation: dictionaryCardsTable.translation,
                                example: dictionaryCardsTable.example,
                                exampleTranslation:
                                    dictionaryCardsTable.exampleTranslation,
                                exampleEnabledOverride:
                                    dictionaryCardsTable.exampleEnabledOverride,
                                exampleTranslationEnabledOverride:
                                    dictionaryCardsTable.exampleTranslationEnabledOverride,
                                exampleLanguageRoleOverride:
                                    dictionaryCardsTable.exampleLanguageRoleOverride,
                            },
                            dictionary: {
                                id: dictionariesTable.id,
                                lifecycle: dictionariesTable.lifecycle,
                                sourceLanguageTag:
                                    dictionariesTable.sourceLanguageTag,
                                targetLanguageTag:
                                    dictionariesTable.targetLanguageTag,
                            },
                            settings: dictionarySettingsTable,
                        })
                        .from(bindings)
                        .innerJoin(jobs, eq(bindings.jobId, jobs.id))
                        .leftJoin(
                            dictionaryCardsTable,
                            eq(bindings.cardId, dictionaryCardsTable.id),
                        )
                        .leftJoin(
                            dictionariesTable,
                            eq(jobs.dictionaryId, dictionariesTable.id),
                        )
                        .leftJoin(
                            dictionarySettingsTable,
                            eq(
                                jobs.dictionaryId,
                                dictionarySettingsTable.dictionaryId,
                            ),
                        )
                        .where(
                            and(
                                inArray(jobs.state, [
                                    'ready',
                                    'failed',
                                    'cancelled',
                                ]),
                                sql`(${dictionaryCardsTable.id} is null or ${dictionaryCardsTable.version} != ${jobs.cardVersion} or ${dictionarySettingsTable.version} != ${jobs.settingsVersion} or ${dictionaryCardsTable.lifecycle} != 'active' or ${dictionariesTable.lifecycle} != 'active')`,
                            ),
                        )
                        .limit(50);
                    for (const row of stale) {
                        const { card, dictionary, settings, job, binding } =
                            row;
                        let fingerprint: string | null = null;
                        if (
                            card &&
                            dictionary &&
                            settings &&
                            card.lifecycle === 'active' &&
                            dictionary.lifecycle === 'active'
                        ) {
                            const exampleEnabled =
                                card.exampleEnabledOverride === null
                                    ? settings.exampleEnabled
                                    : card.exampleEnabledOverride === 'enabled';
                            const exampleTranslationEnabled =
                                exampleEnabled &&
                                (card.exampleTranslationEnabledOverride === null
                                    ? settings.exampleTranslationEnabled
                                    : card.exampleTranslationEnabledOverride ===
                                      'enabled');
                            const role =
                                card.exampleLanguageRoleOverride ??
                                settings.exampleLanguageRole;
                            const text =
                                job.field === 'source'
                                    ? card.source
                                    : job.field === 'translation'
                                      ? card.translation
                                      : job.field === 'example'
                                        ? exampleEnabled
                                            ? card.example
                                            : null
                                        : exampleTranslationEnabled
                                          ? card.exampleTranslation
                                          : null;
                            const language =
                                job.field === 'source'
                                    ? dictionary.sourceLanguageTag
                                    : job.field === 'translation'
                                      ? dictionary.targetLanguageTag
                                      : (
                                              job.field === 'example'
                                                  ? role === 'source'
                                                  : role !== 'source'
                                          )
                                        ? dictionary.sourceLanguageTag
                                        : dictionary.targetLanguageTag;
                            if (text)
                                fingerprint = createHmac(
                                    'sha256',
                                    this.fingerprintSecret,
                                )
                                    .update(
                                        JSON.stringify([
                                            job.ownerId,
                                            job.cardId,
                                            job.field,
                                            text,
                                            language,
                                        ]),
                                    )
                                    .digest('hex');
                        }
                        if (fingerprint !== binding.fingerprint)
                            await tx
                                .delete(bindings)
                                .where(eq(bindings.id, binding.id));
                        else if (card && settings)
                            await tx
                                .update(jobs)
                                .set({
                                    cardVersion: card.version,
                                    settingsVersion: settings.version,
                                })
                                .where(eq(jobs.id, job.id));
                    }
                }
            }
            const idle = new Date(now.getTime() - 30 * 86400000),
                orphan = new Date(now.getTime() - 86400000);
            const [row] = await tx
                .select({ asset: assets, job: jobs })
                .from(assets)
                .innerJoin(jobs, eq(jobs.assetId, assets.id))
                .where(
                    and(
                        sql`(${assets.writerExpiresAt} is null or ${assets.writerExpiresAt} <= ${now.toISOString()})`,
                        sql`(${jobs.leaseExpiresAt} is null or ${jobs.leaseExpiresAt} <= ${now.toISOString()})`,
                        sql`(${assets.state} = 'deleting' or (${jobs.state} in ('ready','failed','cancelled') and (${assets.lastAccessedAt} <= ${idle.toISOString()} or (${assets.createdAt} <= ${orphan.toISOString()} and not exists (select 1 from dictionary_audio_bindings b where b.job_id = ${jobs.id})))) )`,
                    ),
                )
                .orderBy(assets.createdAt)
                .limit(1);
            if (!row) return null;
            await tx
                .update(assets)
                .set({ state: 'deleting' })
                .where(eq(assets.id, row.asset.id));
            await tx.delete(bindings).where(eq(bindings.jobId, row.job.id));
            return { ...row.asset, state: 'deleting' };
        });
    }
    async finishCleanup(assetId: string) {
        await this.database.transaction(async (tx) => {
            const [asset] = await tx
                .select()
                .from(assets)
                .where(
                    and(eq(assets.id, assetId), eq(assets.state, 'deleting')),
                );
            if (!asset) return;
            await tx
                .update(jobs)
                .set({ state: 'cancelled', text: '' })
                .where(eq(jobs.assetId, assetId));
            // Keep the reservation ledger so cleanup cannot reset daily budgets.
            await tx.delete(assets).where(eq(assets.id, assetId));
        });
    }
}
