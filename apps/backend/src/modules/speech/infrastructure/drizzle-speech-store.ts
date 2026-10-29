import {
    authorizeSpeechAccounting,
    reserveSpeechAdmissionQuota,
    reserveSpeechProviderAttempt,
    settleSpeechProviderExpense,
    lockSpeechWalletOwner,
} from './speech-accounting';
import { formatCreditMilli } from '../../ai-credits/domain/exact-credit-amount';
import {
    retainSpeechProviderObservation,
    retainLiveSpeechProviderObservation,
} from './provider-observation';
import { DrizzleCapabilityPolicyParticipant } from '../../ai-credits/infrastructure/persistence/drizzle/drizzle-capability-policy-participant';
import type { CapabilityPolicy } from '@languon/contracts';
import { randomUUID, createHmac } from 'node:crypto';
import { knowledgeSpeechRecordingsTable } from './knowledge-speech-schema';
import { usersTable } from '../../users/infrastructure/persistence/drizzle/schema';
import { isDeepStrictEqual } from 'node:util';
import {
    and,
    asc,
    count,
    desc,
    eq,
    gte,
    gt,
    inArray,
    lte,
    ne,
    or,
    sql,
} from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type {
    SpeechResponse,
    SpeechSource,
    AdminSpeechRecording,
} from '@languon/contracts';
import type { databaseSchema } from '../../../infrastructure/database/schema';
import {
    DrizzleAiCreditTransactionParticipant,
    aiCreditOwnerLockNamespace,
    type AiCreditTransaction,
} from '../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { DrizzleModelPriceParticipant } from '../../ai-credits/infrastructure/persistence/drizzle/drizzle-model-price-participant';
import {
    inspectSpeechText,
    speechTextIdentity,
    speechPrice,
    SpeechError,
    NORMALIZATION_REVISION,
    ELIGIBILITY_REVISION,
} from '../domain/speech-policy';
import type {
    AudioBytes,
    AudioObjectReference,
    ResolvedSpeechSource,
    SpeechJob,
    SpeechProfile,
    SpeechProfileResolver,
    SpeechStore,
    StoredSpeechSource,
    SpeechProviderObservation,
} from '../application/ports';
import {
    adminAuditEventsTable,
    adminMembershipsTable,
} from '../../administration/infrastructure/persistence/drizzle/schema';
import {
    speechBindingsTable as bindings,
    speechJobsTable as jobs,
    speechQuotesTable as quotes,
    speechRecordingsTable as recordings,
} from './schema';

type Database = PostgresJsDatabase<typeof databaseSchema>;
type JobRow = typeof jobs.$inferSelect;
type RecordingRow = typeof recordings.$inferSelect;
type BindingRow = typeof bindings.$inferSelect;
const activeStates = [
    'queued',
    'submitting',
    'processing',
    'storing',
    'submission_unknown',
];
const emptyResponse = (): SpeechResponse => ({
    state: 'unavailable',
    requestId: null,
    playbackId: null,
    quote: null,
    fixture: false,
    retryAfterMs: null,
    error: null,
    billingState: null,
});

export interface DrizzleSpeechStoreOptions {
    database: Database;
    fingerprintSecret: string;
    retainedFingerprintSecrets?: readonly string[];
    profileResolver: SpeechProfileResolver;
    fixtureMode?: boolean;
    storageIdentity: { backend: 'postgres' | 's3'; namespace: string };
    generationEnabled: boolean;
    playbackEnabled: boolean;
    revalidateSource: (
        actorId: string,
        source: SpeechSource | StoredSpeechSource,
        transaction: AiCreditTransaction,
    ) => Promise<ResolvedSpeechSource>;
    maxCharacters?: number;
    ownerQueuedLimit?: number;
    ownerActiveLimit?: number;
    globalActiveLimit?: number;
    freeDailyLimit?: number;
    maxCostUnitsPerClip?: number;
    ownerBudgetUnits?: number;
    globalBudgetUnits?: number;
}

export class DrizzleSpeechStore implements SpeechStore {
    private deletionCursor: string | null = null;
    public constructor(private readonly options: DrizzleSpeechStoreOptions) {}

    private async databaseNow(tx: AiCreditTransaction): Promise<Date> {
        const rows = await tx.execute(sql`select clock_timestamp() as now`);
        const value = rows[0]?.now;
        const now = value instanceof Date ? value : new Date(String(value));
        if (!Number.isFinite(now.getTime()))
            throw new SpeechError('speech_clock_unavailable', 503);
        return now;
    }
    private workerTransaction<T>(
        callback: (transaction: AiCreditTransaction, now: Date) => Promise<T>,
        jobId?: string,
    ): Promise<T> {
        return this.options.database.transaction(async (tx) => {
            await tx.execute(
                sql`select set_config('languon.speech_worker_version','1',true)`,
            );
            if (jobId) {
                const [job] = await tx
                    .select({ ownerId: jobs.payerId })
                    .from(jobs)
                    .where(eq(jobs.id, jobId));
                await lockSpeechWalletOwner(tx, job?.ownerId ?? null);
            }
            return callback(tx, await this.databaseNow(tx));
        });
    }
    private authority(
        source: SpeechSource | StoredSpeechSource,
        resolved: ResolvedSpeechSource,
    ): StoredSpeechSource {
        if (source.kind === 'knowledge-block') return source;
        if (resolved.authority) return resolved.authority;
        if (source.access.kind === 'shared' && !('keyDigest' in source.access))
            throw new SpeechError('speech_source_unavailable', 403);
        return source as StoredSpeechSource;
    }
    private identity(resolved: ResolvedSpeechSource) {
        const inspected = inspectSpeechText(resolved.text, resolved.language);
        if (
            !inspected.characterCount ||
            inspected.characterCount > (this.options.maxCharacters ?? 2000)
        )
            throw new SpeechError('speech_text_unavailable', 400);
        const fixture =
            this.options.fixtureMode ??
            this.options.profileResolver.supports(resolved.language)
                ?.provider === 'fixture';
        const secrets = [
            this.options.fingerprintSecret,
            ...(this.options.retainedFingerprintSecrets ?? []),
        ];
        const keys = secrets.map((secret) => {
            const key = speechTextIdentity(
                secret,
                resolved.language,
                inspected.normalized,
                fixture ? 'fixture' : 'pronunciation',
            );
            if (!resolved.privateKnowledgeSource) return key;
            return createHmac('sha256', secret)
                .update(
                    JSON.stringify([
                        'private-knowledge-narration-v1',
                        resolved.privateKnowledgeSource.ownerId,
                        resolved.privateKnowledgeSource.noteId,
                        key,
                    ]),
                )
                .digest('hex');
        });
        return {
            ...inspected,
            keys,
            key: keys[0]!,
            fixture,
        };
    }

    private profileClass(fixture: boolean) {
        return fixture
            ? sql`${recordings.profile}->>'provider' = 'fixture'`
            : sql`${recordings.profile}->>'provider' <> 'fixture'`;
    }

    private async lock(transaction: AiCreditTransaction, key: string) {
        await transaction.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${key}, 1920424383))`,
        );
    }
    private async ready(
        transaction: AiCreditTransaction,
        keys: string[],
        fixture: boolean,
    ) {
        return (
            await transaction
                .select()
                .from(recordings)
                .where(
                    and(
                        inArray(recordings.canonicalKey, keys),
                        eq(recordings.state, 'ready'),
                        this.profileClass(fixture),
                    ),
                )
                .orderBy(asc(recordings.createdAt))
                .limit(1)
        )[0];
    }
    private async active(
        transaction: AiCreditTransaction,
        keys: string[],
        fixture: boolean,
    ) {
        return (
            await transaction
                .select({ job: jobs })
                .from(jobs)
                .innerJoin(recordings, eq(recordings.id, jobs.recordingId))
                .where(
                    and(
                        inArray(jobs.canonicalKey, keys),
                        inArray(jobs.state, activeStates),
                        this.profileClass(fixture),
                    ),
                )
                .limit(1)
        )[0]?.job;
    }
    public async availability(
        _actorId: string,
        _source: SpeechSource,
        resolved: ResolvedSpeechSource,
    ) {
        if (!this.options.playbackEnabled)
            return { playable: false, generationAvailable: false };
        let identity: ReturnType<DrizzleSpeechStore['identity']>;
        try {
            identity = this.identity(resolved);
        } catch {
            return { playable: false, generationAvailable: false };
        }
        return this.options.database.transaction(async (tx) => {
            const cached = await this.ready(
                tx,
                identity.keys,
                identity.fixture,
            );
            const generationAvailable =
                this.options.generationEnabled &&
                this.options.profileResolver.supports(resolved.language) !==
                    null;
            return {
                playable: !!cached || generationAvailable,
                generationAvailable,
            };
        });
    }
    public async prepare(input: {
        actorId: string;
        source: SpeechSource;
        resolved: ResolvedSpeechSource;
        operationId: string;
        now: Date;
    }): Promise<SpeechResponse> {
        if (!this.options.playbackEnabled) return emptyResponse();
        return this.options.database.transaction(async (tx) => {
            const resolved = await this.options.revalidateSource(
                input.actorId,
                input.source,
                tx,
            );
            const source = this.authority(input.source, resolved);
            const admittedInput = { ...input, source };
            const identity = this.identity(resolved);
            // Source aggregate locks precede canonical/actor admission locks, then wallet locks.
            await this.lock(tx, identity.key);
            await this.lock(tx, `actor:${input.actorId}`);
            const existing = (
                await tx
                    .select()
                    .from(bindings)
                    .where(
                        and(
                            eq(bindings.actorId, input.actorId),
                            eq(bindings.operationId, input.operationId),
                        ),
                    )
                    .limit(1)
            )[0];
            if (existing) {
                if (
                    existing.sourceRevision !== resolved.revision ||
                    !isDeepStrictEqual(existing.source, source)
                )
                    throw new SpeechError('speech_operation_conflict');
                return this.response(tx, existing, input.now);
            }
            const cached = await this.ready(
                tx,
                identity.keys,
                identity.fixture,
            );
            if (cached)
                return this.bind(tx, admittedInput, resolved, cached.id, null);
            const active = await this.active(
                tx,
                identity.keys,
                identity.fixture,
            );
            if (active)
                return this.bind(
                    tx,
                    admittedInput,
                    resolved,
                    active.recordingId,
                    active.id,
                );
            const profile = this.options.profileResolver.supports(
                resolved.language,
            );
            if (!profile || !this.options.generationEnabled)
                return emptyResponse();
            const chargingPolicy = await new DrizzleCapabilityPolicyParticipant(
                tx,
            ).current('speech');
            if (identity.free || chargingPolicy.funding === 'operator')
                return this.admit(
                    tx,
                    admittedInput,
                    resolved,
                    identity,
                    profile,
                    null,
                    0n,
                    chargingPolicy,
                );
            const price = await new DrizzleModelPriceParticipant(tx).current({
                providerId: profile.provider,
                modelId: profile.model,
                meter: 'speech-characters',
            });
            const credits = speechPrice(
                identity.characterCount,
                price.creditsPer1000Characters!,
                price.minimumCredits!,
            );
            const oldQuote = (
                await tx
                    .select()
                    .from(quotes)
                    .where(
                        and(
                            eq(quotes.actorId, input.actorId),
                            eq(quotes.operationId, input.operationId),
                        ),
                    )
                    .limit(1)
            )[0];
            if (
                oldQuote &&
                (oldQuote.sourceRevision !== resolved.revision ||
                    !isDeepStrictEqual(oldQuote.source, source))
            )
                throw new SpeechError('speech_operation_conflict');
            const quote =
                oldQuote ??
                (
                    await tx
                        .insert(quotes)
                        .values({
                            id: randomUUID(),
                            actorId: input.actorId,
                            operationId: input.operationId,
                            source,
                            sourceRevision: resolved.revision,
                            eligibilityRevision: ELIGIBILITY_REVISION,
                            canonicalKey: identity.key,
                            profile,
                            rateRevisionId: price.rateRevisionId,
                            credits,
                            characterCount: identity.characterCount,
                            wordCount: identity.wordCount,
                            provisional: price.provisional ? 1 : 0,
                            createdAt: input.now,
                            expiresAt: new Date(input.now.getTime() + 300_000),
                        })
                        .returning()
                )[0]!;
            const wallet = await new DrizzleAiCreditTransactionParticipant(
                tx,
            ).accountSummary(input.actorId, input.now);
            return {
                ...emptyResponse(),
                state: 'confirmation_required',
                fixture: profile.provider === 'fixture',
                quote: {
                    id: quote.id,
                    credits: formatCreditMilli(quote.credits),
                    availableCredits: formatCreditMilli(
                        wallet.availableCredits,
                    ),
                    unlimited: wallet.policy.effectiveMode === 'unlimited',
                    characterCount: quote.characterCount,
                    wordCount: quote.wordCount,
                    expiresAt: quote.expiresAt.toISOString(),
                    provisional: quote.provisional === 1,
                },
            };
        });
    }
    public async confirm(input: {
        actorId: string;
        quoteId: string;
        operationId: string;
        now: Date;
    }): Promise<SpeechResponse> {
        if (!this.options.playbackEnabled) return emptyResponse();
        return this.options.database.transaction(async (tx) => {
            const quote = (
                await tx
                    .select()
                    .from(quotes)
                    .where(
                        and(
                            eq(quotes.id, input.quoteId),
                            eq(quotes.actorId, input.actorId),
                        ),
                    )
                    .limit(1)
            )[0];
            if (!quote) throw new SpeechError('speech_quote_not_found', 404);
            const resolved = await this.options.revalidateSource(
                input.actorId,
                quote.source,
                tx,
            );
            const identity = this.identity(resolved);
            await this.lock(tx, identity.key);
            await this.lock(tx, `actor:${input.actorId}`);
            if (
                resolved.revision !== quote.sourceRevision ||
                !identity.keys.includes(quote.canonicalKey)
            )
                throw new SpeechError('speech_quote_stale');
            const duplicate = (
                await tx
                    .select()
                    .from(bindings)
                    .where(
                        and(
                            eq(bindings.actorId, input.actorId),
                            eq(bindings.operationId, input.operationId),
                        ),
                    )
                    .limit(1)
            )[0];
            if (
                duplicate &&
                (duplicate.sourceRevision !== resolved.revision ||
                    !isDeepStrictEqual(duplicate.source, quote.source))
            )
                throw new SpeechError('speech_operation_conflict');
            if (duplicate) return this.response(tx, duplicate, input.now);
            const currentQuote = (
                await tx
                    .select()
                    .from(quotes)
                    .where(eq(quotes.id, quote.id))
                    .limit(1)
            )[0]!;
            if (currentQuote.bindingId) {
                const binding = (
                    await tx
                        .select()
                        .from(bindings)
                        .where(eq(bindings.id, currentQuote.bindingId))
                        .limit(1)
                )[0];
                if (binding) return this.response(tx, binding, input.now);
            }
            const bindInput = { ...input, source: quote.source };
            const cached = await this.ready(
                tx,
                identity.keys,
                identity.fixture,
            );
            const active = await this.active(
                tx,
                identity.keys,
                identity.fixture,
            );
            let response: SpeechResponse;
            if (cached)
                response = await this.bind(
                    tx,
                    bindInput,
                    resolved,
                    cached.id,
                    null,
                );
            else if (active)
                response = await this.bind(
                    tx,
                    bindInput,
                    resolved,
                    active.recordingId,
                    active.id,
                );
            else {
                if (quote.eligibilityRevision !== ELIGIBILITY_REVISION)
                    throw new SpeechError('speech_quote_stale');
                if (quote.expiresAt <= input.now)
                    throw new SpeechError('speech_quote_expired');
                const profile = this.options.profileResolver.supports(
                    resolved.language,
                );
                if (!profile || !this.options.generationEnabled)
                    throw new SpeechError('speech_generation_unavailable', 503);
                if (!isDeepStrictEqual(profile, quote.profile))
                    throw new SpeechError('speech_quote_stale');
                const price = await new DrizzleModelPriceParticipant(
                    tx,
                ).current({
                    providerId: profile.provider,
                    modelId: profile.model,
                    meter: 'speech-characters',
                });
                if (price.rateRevisionId !== quote.rateRevisionId)
                    throw new SpeechError('speech_quote_stale');
                response = await this.admit(
                    tx,
                    bindInput,
                    resolved,
                    identity,
                    profile,
                    quote.rateRevisionId,
                    quote.credits,
                );
            }
            if (response.requestId)
                await tx
                    .update(quotes)
                    .set({ bindingId: response.requestId })
                    .where(eq(quotes.id, quote.id));
            return response;
        });
    }
    private async bind(
        tx: AiCreditTransaction,
        input: {
            actorId: string;
            source: StoredSpeechSource;
            operationId: string;
            now: Date;
        },
        resolved: ResolvedSpeechSource,
        recordingId: string,
        jobId: string | null,
    ) {
        // Retained-key callers may hold a different canonical advisory lock.
        // Serialize association changes with the recording's deletion inventory.
        const [recording] = await tx
            .select()
            .from(recordings)
            .where(eq(recordings.id, recordingId))
            .limit(1)
            .for('update');
        if (!recording || !['ready', 'pending'].includes(recording.state))
            throw new SpeechError('speech_recording_unavailable', 404);
        if (recording.state === 'pending') {
            const [activeJob] = jobId
                ? await tx
                      .select({ id: jobs.id })
                      .from(jobs)
                      .where(
                          and(
                              eq(jobs.id, jobId),
                              eq(jobs.recordingId, recordingId),
                              inArray(jobs.state, activeStates),
                          ),
                      )
                      .limit(1)
                : [];
            if (!activeJob)
                throw new SpeechError('speech_recording_unavailable', 404);
        }
        const [existing] = await tx
            .select()
            .from(bindings)
            .where(
                and(
                    eq(bindings.actorId, input.actorId),
                    eq(bindings.recordingId, recordingId),
                    eq(bindings.sourceRevision, resolved.revision),
                    sql`${bindings.source} = ${JSON.stringify(input.source)}::jsonb`,
                ),
            )
            .limit(1);
        if (existing) {
            const response = await this.response(tx, existing, input.now);
            return jobId === null
                ? { ...response, billingState: 'free' as const }
                : response;
        }
        if (resolved.privateKnowledgeSource)
            await tx
                .insert(knowledgeSpeechRecordingsTable)
                .values({
                    recordingId,
                    noteId: resolved.privateKnowledgeSource.noteId,
                })
                .onConflictDoNothing();
        const [binding] = await tx
            .insert(bindings)
            .values({
                id: randomUUID(),
                actorId: input.actorId,
                operationId: input.operationId,
                source: input.source,
                sourceRevision: resolved.revision,
                dictionaryId: resolved.dictionaryId,
                cardId: resolved.cardId,
                exerciseId: resolved.exerciseId,
                attemptId: resolved.attemptId,
                recordingId,
                jobId,
                createdAt: input.now,
            })
            .returning();
        await tx
            .update(recordings)
            .set({ version: sql`${recordings.version} + 1` })
            .where(eq(recordings.id, recordingId));
        return this.response(tx, binding!, input.now);
    }
    private async admit(
        tx: AiCreditTransaction,
        input: {
            actorId: string;
            source: StoredSpeechSource;
            operationId: string;
            now: Date;
        },
        resolved: ResolvedSpeechSource,
        identity: ReturnType<DrizzleSpeechStore['identity']>,
        profile: SpeechProfile,
        rateRevisionId: string | null,
        credits: bigint,
        chargingPolicy?: CapabilityPolicy,
    ) {
        // Recheck all configured identities after the cross-key budget lock:
        // another admitted request may have filled the cache while we waited.
        await this.lock(tx, 'operational-budget');
        const cached = await this.ready(tx, identity.keys, identity.fixture);
        if (cached) return this.bind(tx, input, resolved, cached.id, null);
        const active = await this.active(tx, identity.keys, identity.fixture);
        if (active)
            return this.bind(
                tx,
                input,
                resolved,
                active.recordingId,
                active.id,
            );
        input = { ...input, now: await this.databaseNow(tx) };
        const jobId = randomUUID();
        const actionPolicy = await new DrizzleCapabilityPolicyParticipant(
            tx,
        ).pinAction({
            jobId,
            jobKind: 'speech-generation',
            ownerId: input.actorId,
            at: input.now,
            ...(chargingPolicy ? { policy: chargingPolicy } : {}),
        });
        if (actionPolicy.funding === 'operator') credits = 0n;
        const [queued] = await tx
            .select({ value: count() })
            .from(jobs)
            .where(
                and(
                    eq(jobs.payerId, input.actorId),
                    inArray(jobs.state, activeStates),
                ),
            );
        if ((queued?.value ?? 0) >= (this.options.ownerQueuedLimit ?? 10))
            throw new SpeechError('speech_queue_limit', 429);
        const estimatedCost = Math.ceil(
            identity.characterCount * profile.estimatedCostUnitsPerCharacter,
        );
        if (estimatedCost > (this.options.maxCostUnitsPerClip ?? 10000))
            throw new SpeechError('speech_provider_budget', 429);
        await reserveSpeechAdmissionQuota(tx, {
            ownerId: input.actorId,
            at: input.now,
            free: credits === 0n,
            units: estimatedCost,
            freeLimit: this.options.freeDailyLimit ?? 500,
            ownerUnitLimit: this.options.ownerBudgetUnits ?? 10000,
            globalUnitLimit: this.options.globalBudgetUnits ?? 100000,
        });
        const providerPriceSnapshot = await authorizeSpeechAccounting(tx, {
            jobId,
            ownerId: input.actorId,
            profile,
            characters: identity.characterCount,
            at: input.now,
        });
        const recordingId = randomUUID(),
            reservationId = credits > 0n ? randomUUID() : null;
        await tx.insert(recordings).values({
            id: recordingId,
            canonicalKey: identity.key,
            text: identity.normalized,
            language: resolved.language,
            normalizationRevision: NORMALIZATION_REVISION,
            profile,
            state: 'pending',
            storage: {
                ...this.options.storageIdentity,
                key: `speech/${recordingId}`,
            },
            createdAt: input.now,
            lastAccessedAt: input.now,
        });
        await tx.insert(jobs).values({
            id: jobId,
            recordingId,
            canonicalKey: identity.key,
            eligibilityRevision: ELIGIBILITY_REVISION,
            payerId: input.actorId,
            reservationId,
            rateRevisionId,
            credits,
            estimatedCostUnits: estimatedCost,
            accountingVersion: 1,
            providerPriceSnapshot,
            providerCharacterCount: identity.characterCount,
            providerUsageBounds: providerPriceSnapshot.nativeRules
                ? {
                      ...(profile.nativeBilling?.usageBounds ?? {}),
                      characters: identity.characterCount,
                      requests: 1,
                  }
                : null,
            billingState: reservationId ? 'reserved' : 'free',
            state: 'queued',
            nextPollAt: input.now,
            createdAt: input.now,
            billingDeadline: new Date(input.now.getTime() + 600_000),
            queueDeadline: new Date(input.now.getTime() + 120_000),
            recoveryDeadline: new Date(input.now.getTime() + 86_400_000),
        });
        if (reservationId)
            await new DrizzleAiCreditTransactionParticipant(tx).reserveAttempt({
                ownerId: input.actorId,
                reservationId,
                jobId,
                jobKind: 'speech-generation',
                attempt: 1,
                maximumCredits: credits,
                at: input.now,
            });
        return this.bind(tx, input, resolved, recordingId, jobId);
    }
    private async response(
        tx: AiCreditTransaction,
        binding: BindingRow,
        _now: Date,
    ): Promise<SpeechResponse> {
        const recording = (
            await tx
                .select()
                .from(recordings)
                .where(eq(recordings.id, binding.recordingId))
                .limit(1)
        )[0];
        const job = binding.jobId
            ? (
                  await tx
                      .select()
                      .from(jobs)
                      .where(eq(jobs.id, binding.jobId))
                      .limit(1)
              )[0]
            : null;
        // Failed-job cleanup removes inventory, not the caller's safe outcome.
        if (job?.state === 'failed') {
            return {
                ...emptyResponse(),
                state: 'failed',
                requestId: binding.id,
                fixture: recording?.profile.provider === 'fixture',
                error: job.error ?? 'speech_generation_failed',
                billingState:
                    job.payerId === binding.actorId
                        ? (job.billingState as SpeechResponse['billingState'])
                        : 'free',
            };
        }
        if (
            !recording ||
            ['deleting', 'deleted', 'failed'].includes(recording.state)
        ) {
            return {
                ...emptyResponse(),
                state: 'failed',
                requestId: binding.id,
                error: 'speech_recording_unavailable',
            };
        }
        const state =
            recording.state === 'ready'
                ? 'ready'
                : job?.state === 'submission_unknown'
                  ? 'submission_unknown'
                  : job?.state === 'queued'
                    ? 'queued'
                    : job?.state === 'failed'
                      ? 'failed'
                      : 'processing';
        // The billing state of a joining actor must never expose the initiator's payment.
        const billingState =
            job?.payerId === binding.actorId
                ? (job.billingState as SpeechResponse['billingState'])
                : 'free';
        return {
            ...emptyResponse(),
            state,
            requestId: binding.id,
            playbackId: state === 'ready' ? binding.id : null,
            fixture: recording.profile.provider === 'fixture',
            billingState,
            retryAfterMs: ['queued', 'processing'].includes(state)
                ? 2500
                : null,
            error: job?.error ?? null,
        };
    }
    public async request(actorId: string, requestId: string, now: Date) {
        if (!this.options.playbackEnabled)
            throw new SpeechError('speech_playback_unavailable', 503);
        return this.options.database.transaction(async (tx) => {
            const row = (
                await tx
                    .select()
                    .from(bindings)
                    .where(
                        and(
                            eq(bindings.id, requestId),
                            eq(bindings.actorId, actorId),
                        ),
                    )
                    .limit(1)
            )[0];
            if (!row) throw new SpeechError('speech_request_not_found', 404);
            return {
                source: row.source,
                revision: row.sourceRevision,
                response: await this.response(tx, row, now),
            };
        });
    }
    public async playback(actorId: string, playbackId: string, now: Date) {
        if (!this.options.playbackEnabled)
            throw new SpeechError('speech_playback_unavailable', 503);
        return this.options.database.transaction(async (tx) => {
            const row = (
                await tx
                    .select({ binding: bindings, recording: recordings })
                    .from(bindings)
                    .innerJoin(
                        recordings,
                        eq(bindings.recordingId, recordings.id),
                    )
                    .where(
                        and(
                            eq(bindings.id, playbackId),
                            eq(bindings.actorId, actorId),
                            eq(recordings.state, 'ready'),
                        ),
                    )
                    .limit(1)
            )[0];
            if (!row?.recording.checksum)
                throw new SpeechError('speech_recording_unavailable', 404);
            await tx
                .update(recordings)
                .set({ lastAccessedAt: now })
                .where(eq(recordings.id, row.recording.id));
            return {
                source: row.binding.source,
                revision: row.binding.sourceRevision,
                storage: row.recording.storage,
                checksum: row.recording.checksum,
                fixture: row.recording.profile.provider === 'fixture',
            };
        });
    }
    private asJob(row: JobRow, recording: RecordingRow): SpeechJob {
        return {
            id: row.id,
            recordingId: recording.id,
            text: recording.text,
            language: recording.language,
            profile: recording.profile,
            state: row.state,
            taskId: row.taskId,
            leaseToken: row.leaseToken!,
            deadlineAt: row.recoveryDeadline,
            storage: recording.storage,
            checksum: recording.checksum,
        };
    }
    public async claim(_now: Date): Promise<SpeechJob | null> {
        const eligible = sql`${jobs.state} in ('queued','processing','storing') and ${jobs.nextPollAt}<=clock_timestamp() and ${jobs.recoveryDeadline}>=clock_timestamp() and (${jobs.state}<>'queued' or ${jobs.queueDeadline}>clock_timestamp()) and (${jobs.leaseExpiresAt} is null or ${jobs.leaseExpiresAt}<=clock_timestamp())`;
        const candidates = await this.options.database
            .select({ id: jobs.id })
            .from(jobs)
            .where(eligible)
            .orderBy(asc(jobs.nextPollAt))
            .limit(20);
        for (const candidate of candidates) {
            const result = await this.workerTransaction(async (tx, now) => {
                await this.lock(tx, 'worker-capacity');
                const [row] = await tx
                    .select()
                    .from(jobs)
                    .where(and(eq(jobs.id, candidate.id), eligible))
                    .for('update', { skipLocked: true });
                if (!row) return null;
                const leased = and(
                    inArray(jobs.state, [
                        'submitting',
                        'processing',
                        'storing',
                    ]),
                    gte(jobs.leaseExpiresAt, now),
                );
                const [active] = await tx
                    .select({ value: count() })
                    .from(jobs)
                    .where(leased);
                if (
                    (active?.value ?? 0) >=
                    (this.options.globalActiveLimit ?? 4)
                )
                    return null;
                if (row.payerId) {
                    const [owned] = await tx
                        .select({ value: count() })
                        .from(jobs)
                        .where(and(leased, eq(jobs.payerId, row.payerId)));
                    if (
                        (owned?.value ?? 0) >=
                        (this.options.ownerActiveLimit ?? 2)
                    )
                        return null;
                }
                const [claimed] = await tx
                    .update(jobs)
                    .set({
                        state:
                            row.state === 'queued' ? 'submitting' : row.state,
                        leaseToken: randomUUID(),
                        leaseExpiresAt: new Date(now.getTime() + 60_000),
                    })
                    .where(eq(jobs.id, row.id))
                    .returning();
                if (!claimed) return null;
                if (row.state === 'queued')
                    await reserveSpeechProviderAttempt(tx, claimed, now);
                const [acknowledged] = await tx
                    .select()
                    .from(jobs)
                    .where(eq(jobs.id, row.id));
                const [recording] = await tx
                    .select()
                    .from(recordings)
                    .where(eq(recordings.id, row.recordingId));
                return acknowledged && recording
                    ? this.asJob(acknowledged, recording)
                    : null;
            }, candidate.id);
            if (result) return result;
        }
        return null;
    }
    public async submitted(
        job: SpeechJob,
        taskId: string,
        retryAfterMs: number,
        _now: Date,
    ) {
        // Even a late acknowledgement records the known task identity, never resubmits.
        await this.workerTransaction(async (tx, now) => {
            await tx
                .update(jobs)
                .set({
                    state: 'processing',
                    taskId,
                    nextPollAt: new Date(now.getTime() + retryAfterMs),
                    leaseToken: null,
                    leaseExpiresAt: null,
                })
                .where(
                    and(
                        eq(jobs.id, job.id),
                        inArray(jobs.state, [
                            'submitting',
                            'submission_unknown',
                        ]),
                        sql`${jobs.taskId} is null`,
                    ),
                );
        }, job.id);
    }
    public async pending(
        job: SpeechJob,
        retryAfterMs: number,
        _now: Date,
        observation?: SpeechProviderObservation,
    ) {
        await this.workerTransaction(async (tx, now) => {
            await retainLiveSpeechProviderObservation(
                tx,
                job,
                observation,
                now,
            );
            await tx
                .update(jobs)
                .set({
                    nextPollAt: new Date(now.getTime() + retryAfterMs),
                    leaseToken: null,
                    leaseExpiresAt: null,
                })
                .where(
                    and(
                        eq(jobs.id, job.id),
                        eq(jobs.leaseToken, job.leaseToken),
                    ),
                );
        }, job.id);
    }
    public async storing(
        job: SpeechJob,
        audio: AudioBytes,
        _now: Date,
        observation?: SpeechProviderObservation,
    ) {
        return this.workerTransaction(async (tx, now) => {
            const [row] = await tx
                .update(jobs)
                .set({
                    state: 'storing',
                    leaseExpiresAt: new Date(now.getTime() + 60_000),
                })
                .where(
                    and(
                        eq(jobs.id, job.id),
                        eq(jobs.leaseToken, job.leaseToken),
                        gte(jobs.leaseExpiresAt, now),
                    ),
                )
                .returning();
            if (!row) return false;
            await retainSpeechProviderObservation(tx, row, job, observation);
            await tx
                .update(recordings)
                .set({
                    checksum: audio.checksum,
                    byteLength: audio.bytes.length,
                    durationMs: audio.durationMs ?? null,
                })
                .where(eq(recordings.id, job.recordingId));
            await settleSpeechProviderExpense(tx, row, 'ready', now);
            return true;
        }, job.id);
    }
    public async complete(
        job: SpeechJob,
        storage: AudioObjectReference,
        audio: AudioBytes,
        _now: Date,
    ) {
        await this.workerTransaction(async (tx, now) => {
            const row = (
                await tx
                    .select()
                    .from(jobs)
                    .where(
                        and(
                            eq(jobs.id, job.id),
                            eq(jobs.leaseToken, job.leaseToken),
                            gte(jobs.leaseExpiresAt, now),
                        ),
                    )
                    .limit(1)
                    .for('update')
            )[0];
            if (!row || row.state !== 'storing') return;
            await settleSpeechProviderExpense(tx, row, 'ready', now);
            const [recording] = await tx
                .select()
                .from(recordings)
                .where(eq(recordings.id, row.recordingId))
                .limit(1)
                .for('update');
            if (!recording || recording.state !== 'pending') return;
            if (
                row.reservationId &&
                row.payerId &&
                row.billingState === 'reserved'
            )
                await tx.execute(
                    sql`select pg_advisory_xact_lock(hashtextextended(${row.payerId},${aiCreditOwnerLockNamespace}))`,
                );
            const publicationNow = await this.databaseNow(tx);
            if (!row.leaseExpiresAt || row.leaseExpiresAt <= publicationNow)
                return;
            const [published] = await tx
                .update(recordings)
                .set({
                    state: 'ready',
                    storage,
                    checksum: audio.checksum,
                    byteLength: audio.bytes.length,
                    durationMs: audio.durationMs ?? recording.durationMs,
                    version: sql`${recordings.version}+1`,
                })
                .where(eq(recordings.id, row.recordingId))
                .returning({ readyAt: recordings.readyAt });
            const settlementNow = await this.databaseNow(tx);
            let billingState = row.billingState;
            if (
                row.reservationId &&
                row.payerId &&
                billingState === 'reserved'
            ) {
                const settled = await new DrizzleAiCreditTransactionParticipant(
                    tx,
                ).settleSpeechAttempt({
                    ownerId: row.payerId,
                    reservationId: row.reservationId,
                    settledAt: settlementNow,
                    billingDeadline: row.billingDeadline,
                    outcome:
                        published?.readyAt &&
                        published.readyAt < row.billingDeadline &&
                        settlementNow < row.billingDeadline
                            ? 'success'
                            : 'deadline',
                });
                billingState =
                    settled.chargedCredits > 0n
                        ? 'charged_success'
                        : 'released_no_charge';
            }
            await tx
                .update(jobs)
                .set({
                    state: 'ready',
                    billingState,
                    leaseToken: null,
                    leaseExpiresAt: null,
                })
                .where(eq(jobs.id, row.id));
        }, job.id);
    }
    public async fail(
        job: SpeechJob,
        outcome: 'failure' | 'unknown',
        _now: Date,
        reason?: 'speech_provider_unavailable',
        notSubmitted = false,
        observation?: SpeechProviderObservation,
    ) {
        await this.workerTransaction(async (tx, now) => {
            const [row] = await tx
                .select()
                .from(jobs)
                .where(
                    and(
                        eq(jobs.id, job.id),
                        eq(jobs.leaseToken, job.leaseToken),
                    ),
                )
                .limit(1)
                .for('update');
            if (!row) return;
            if (observation)
                await retainSpeechProviderObservation(
                    tx,
                    row,
                    job,
                    observation,
                );
            await settleSpeechProviderExpense(
                tx,
                row,
                notSubmitted ? 'not_submitted' : 'unknown',
                now,
            );
            await tx
                .update(jobs)
                .set({
                    state:
                        outcome === 'unknown' ? 'submission_unknown' : 'failed',
                })
                .where(eq(jobs.id, row.id));
            let billingState = row.billingState;
            if (
                row.reservationId &&
                row.payerId &&
                billingState === 'reserved' &&
                outcome === 'failure'
            ) {
                await new DrizzleAiCreditTransactionParticipant(
                    tx,
                ).settleSpeechAttempt({
                    ownerId: row.payerId,
                    reservationId: row.reservationId,
                    settledAt: now,
                    outcome: 'failure',
                });
                billingState = 'released_no_charge';
            }
            await tx
                .update(jobs)
                .set({
                    state:
                        outcome === 'unknown' ? 'submission_unknown' : 'failed',
                    billingState,
                    error:
                        outcome === 'unknown'
                            ? 'speech_submission_unknown'
                            : (reason ?? 'speech_generation_failed'),
                    leaseToken: null,
                    leaseExpiresAt: null,
                })
                .where(eq(jobs.id, row.id));
            if (outcome === 'failure')
                await tx
                    .update(recordings)
                    .set({
                        state: 'deleting',
                        text: '',
                        version: sql`${recordings.version}+1`,
                    })
                    .where(eq(recordings.id, row.recordingId));
        }, job.id);
    }
    public async releaseDeadlines(_now: Date) {
        const due = await this.workerTransaction(async (tx, now) =>
            tx
                .select({ id: jobs.id })
                .from(jobs)
                .where(
                    or(
                        and(
                            eq(jobs.billingState, 'reserved'),
                            lte(jobs.billingDeadline, now),
                        ),
                        and(
                            eq(jobs.state, 'queued'),
                            lte(jobs.queueDeadline, now),
                        ),
                        and(
                            eq(jobs.state, 'submitting'),
                            lte(jobs.leaseExpiresAt, now),
                        ),
                        and(
                            inArray(jobs.state, ['processing', 'storing']),
                            lte(jobs.recoveryDeadline, now),
                        ),
                    ),
                )
                .limit(100),
        );
        for (const candidate of due) {
            await this.workerTransaction(async (tx, now) => {
                const [row] = await tx
                    .select()
                    .from(jobs)
                    .where(
                        and(
                            eq(jobs.id, candidate.id),
                            or(
                                and(
                                    eq(jobs.billingState, 'reserved'),
                                    lte(jobs.billingDeadline, now),
                                ),
                                and(
                                    eq(jobs.state, 'queued'),
                                    lte(jobs.queueDeadline, now),
                                ),
                                and(
                                    eq(jobs.state, 'submitting'),
                                    lte(jobs.leaseExpiresAt, now),
                                ),
                                and(
                                    inArray(jobs.state, [
                                        'processing',
                                        'storing',
                                    ]),
                                    lte(jobs.recoveryDeadline, now),
                                ),
                            ),
                        ),
                    )
                    .for('update', { skipLocked: true });
                if (!row) return;
                let billingState = row.billingState;
                if (
                    row.reservationId &&
                    row.payerId &&
                    billingState === 'reserved' &&
                    (row.billingDeadline <= now || row.state === 'queued')
                ) {
                    await new DrizzleAiCreditTransactionParticipant(
                        tx,
                    ).settleSpeechAttempt({
                        ownerId: row.payerId,
                        reservationId: row.reservationId,
                        settledAt: now,
                        outcome: 'deadline',
                    });
                    billingState = 'released_no_charge';
                }
                const state =
                    row.state === 'queued'
                        ? 'failed'
                        : row.state === 'submitting'
                          ? 'submission_unknown'
                          : row.recoveryDeadline <= now
                            ? 'submission_unknown'
                            : row.state;
                if (state === 'failed' || state === 'submission_unknown')
                    await settleSpeechProviderExpense(
                        tx,
                        row,
                        state === 'failed' && !row.providerDispatchedAt
                            ? 'not_submitted'
                            : 'unknown',
                        now,
                    );
                await tx
                    .update(jobs)
                    .set({
                        state,
                        billingState,
                        ...(state === 'submission_unknown' || state === 'failed'
                            ? {
                                  leaseToken: null,
                                  leaseExpiresAt: null,
                                  error:
                                      state === 'failed'
                                          ? 'speech_queue_timeout'
                                          : 'speech_reconciliation_required',
                              }
                            : {}),
                    })
                    .where(eq(jobs.id, row.id));
                if (state === 'failed')
                    await tx
                        .update(recordings)
                        .set({
                            state: 'deleting',
                            text: '',
                            version: sql`${recordings.version}+1`,
                        })
                        .where(eq(recordings.id, row.recordingId));
            }, candidate.id);
        }
        await this.workerTransaction(async (tx, now) => {
            // Compact request quotas retain only a short operational window; financial cost facts live separately.
            await tx.execute(
                sql`select languon_cleanup_speech_admission_counters(1000)`,
            );
            await tx
                .update(recordings)
                .set({ text: '' })
                .where(
                    and(
                        eq(recordings.state, 'pending'),
                        ne(recordings.text, ''),
                        sql`exists(select 1 from speech_jobs j where j.recording_id=speech_recordings.id and j.state='submission_unknown' and j.recovery_deadline<=${now.toISOString()}::timestamptz)`,
                    ),
                );
            const abandoned = await tx
                .select({ id: recordings.id })
                .from(recordings)
                .where(
                    and(
                        or(
                            eq(recordings.state, 'failed'),
                            and(
                                eq(recordings.state, 'pending'),
                                lte(
                                    recordings.createdAt,
                                    new Date(now.getTime() - 86_400_000),
                                ),
                            ),
                        ),
                        sql`not exists(select 1 from speech_jobs j where j.recording_id=speech_recordings.id and (j.state in ('queued','submitting','processing','storing','submission_unknown') or j.lease_expires_at>${now.toISOString()}::timestamptz))`,
                    ),
                )
                .limit(100)
                .for('update', { skipLocked: true });
            for (const row of abandoned)
                await tx
                    .update(recordings)
                    .set({
                        state: 'deleting',
                        text: '',
                        version: sql`${recordings.version}+1`,
                    })
                    .where(eq(recordings.id, row.id));
        });
    }
    public async listRecordings(query: {
        search?: string;
        language?: string;
        provider?: string;
        model?: string;
        linked?: 'true' | 'false';
        state?: string;
        createdFrom?: string;
        createdTo?: string;
        page: number;
        pageSize: number;
    }) {
        const bindingCount = sql<number>`(select count(*)::integer from speech_bindings b where b.recording_id=speech_recordings.id)`;
        const filters = [ne(recordings.state, 'deleted')];
        if (query.search)
            filters.push(
                sql`position(lower(${query.search}) in lower(${recordings.text})) > 0`,
            );
        if (query.language)
            filters.push(eq(recordings.language, query.language));
        if (query.provider)
            filters.push(
                sql`${recordings.profile}->>'provider' = ${query.provider}`,
            );
        if (query.model)
            filters.push(sql`${recordings.profile}->>'model' = ${query.model}`);
        if (query.state) filters.push(eq(recordings.state, query.state));
        if (query.createdFrom)
            filters.push(
                gte(recordings.createdAt, new Date(query.createdFrom)),
            );
        if (query.createdTo)
            filters.push(lte(recordings.createdAt, new Date(query.createdTo)));
        if (query.linked)
            filters.push(
                query.linked === 'true'
                    ? sql`${bindingCount}>0`
                    : sql`${bindingCount}=0`,
            );
        const where = and(...filters);
        const [rows, totals] = await Promise.all([
            this.options.database
                .select({ recording: recordings, bindingCount })
                .from(recordings)
                .where(where)
                .orderBy(desc(recordings.createdAt), asc(recordings.id))
                .limit(query.pageSize)
                .offset((query.page - 1) * query.pageSize),
            this.options.database
                .select({ value: count() })
                .from(recordings)
                .where(where),
        ]);
        return {
            recordings: rows.map(
                ({ recording: r, bindingCount }): AdminSpeechRecording => ({
                    id: r.id,
                    text: r.text,
                    language: r.language,
                    provider: r.profile.provider,
                    model: r.profile.model,
                    state: r.state,
                    bindingCount,
                    byteLength: r.byteLength,
                    durationMs: r.durationMs,
                    createdAt: r.createdAt.toISOString(),
                    lastAccessedAt: r.lastAccessedAt.toISOString(),
                    version: r.version,
                }),
            ),
            total: totals[0]?.value ?? 0,
        };
    }
    public async adminPlayback(recordingId: string) {
        const [row] = await this.options.database
            .select()
            .from(recordings)
            .where(
                and(
                    eq(recordings.id, recordingId),
                    eq(recordings.state, 'ready'),
                ),
            )
            .limit(1);
        if (!row) throw new SpeechError('speech_recording_unavailable', 404);
        return row.storage;
    }
    public async markDeleting(input: {
        audit: {
            actorId: string;
            correlationId: string;
            reason: string;
            occurredAt: Date;
        };
        recordings: {
            id: string;
            expectedVersion: number;
            expectedBindingCount: number;
        }[];
    }) {
        return this.options.database.transaction(async (tx) => {
            const [administrator] = await tx
                .select({ id: adminMembershipsTable.id })
                .from(adminMembershipsTable)
                .innerJoin(
                    usersTable,
                    eq(usersTable.id, adminMembershipsTable.userId),
                )
                .where(
                    and(
                        eq(adminMembershipsTable.userId, input.audit.actorId),
                        eq(adminMembershipsTable.role, 'owner'),
                        sql`${adminMembershipsTable.revokedAt} is null`,
                        eq(usersTable.status, 'active'),
                    ),
                )
                .for('share');
            if (!administrator)
                throw new SpeechError('admin_access_denied', 403);
            const selected: { id: string; storage: AudioObjectReference }[] =
                [];
            for (const target of [...input.recordings].sort((a, b) =>
                a.id.localeCompare(b.id),
            )) {
                const [snapshot] = await tx
                    .select()
                    .from(recordings)
                    .where(eq(recordings.id, target.id))
                    .limit(1);
                if (!snapshot)
                    throw new SpeechError('speech_recording_not_found', 404);
                await this.lock(tx, snapshot.canonicalKey);
                const [row] = await tx
                    .select()
                    .from(recordings)
                    .where(eq(recordings.id, target.id))
                    .limit(1)
                    .for('update');
                const [linked] = await tx
                    .select({ value: count() })
                    .from(bindings)
                    .where(eq(bindings.recordingId, target.id));
                if (
                    !row ||
                    row.version !== target.expectedVersion ||
                    linked?.value !== target.expectedBindingCount ||
                    !['ready', 'deleting', 'failed'].includes(row.state)
                )
                    throw new SpeechError('speech_delete_impact_changed');
                selected.push({ id: row.id, storage: row.storage });
            }
            for (const target of selected) {
                await tx
                    .update(recordings)
                    .set({
                        state: 'deleting',
                        text: '',
                        version: sql`${recordings.version}+1`,
                    })
                    .where(eq(recordings.id, target.id));
            }
            await tx.insert(adminAuditEventsTable).values({
                id: randomUUID(),
                action: 'speech_recordings_deleted',
                actorUserId: input.audit.actorId,
                correlationId: input.audit.correlationId,
                reason: input.audit.reason,
                occurredAt: input.audit.occurredAt,
                expiresAt: new Date(
                    input.audit.occurredAt.getTime() + 365 * 86_400_000,
                ),
                outcome: 'success',
                metadata: { recordingIds: selected.map((item) => item.id) },
            });
            return selected;
        });
    }
    public async deleted(recordingId: string, _now = new Date()) {
        await this.workerTransaction(async (tx, now) => {
            // Keep association IDs as idempotency tombstones until source/account
            // deletion. Erasing a consumed quote's binding would permit a replay
            // of the same confirmation to reserve/charge a second generation.
            await tx
                .update(recordings)
                .set({
                    state: 'deleted',
                    text: '',
                    deletedAt: now,
                    version: sql`${recordings.version}+1`,
                })
                .where(
                    and(
                        eq(recordings.id, recordingId),
                        eq(recordings.state, 'deleting'),
                    ),
                );
        });
    }
    public async deletionInventory(now: Date) {
        // Cycle through durable tombstones so repeated verification of the first
        // page cannot starve later removals after more than 100 admin deletions.
        const rows = await this.options.database
            .select({ id: recordings.id, storage: recordings.storage })
            .from(recordings)
            .where(
                and(
                    or(
                        eq(recordings.state, 'deleting'),
                        and(
                            eq(recordings.state, 'deleted'),
                            gte(
                                recordings.deletedAt,
                                new Date(now.getTime() - 86_400_000),
                            ),
                        ),
                    ),
                    this.deletionCursor
                        ? gt(recordings.id, this.deletionCursor)
                        : undefined,
                ),
            )
            .orderBy(asc(recordings.id))
            .limit(100);
        this.deletionCursor = rows.length === 100 ? rows.at(-1)!.id : null;
        return rows;
    }
    public async purgeActor(
        actorId: string,
        now: Date,
        authorization?: { workerId: string; fencingToken: number },
    ) {
        await this.options.database.transaction((tx) =>
            this.purgeActorInTransaction(tx, actorId, now, authorization),
        );
    }
    public async purgeActorInTransaction(
        tx: AiCreditTransaction,
        actorId: string,
        now: Date,
        authorization?: { workerId: string; fencingToken: number },
    ) {
        await purgeSpeechActor(tx, actorId, now, authorization);
    }
}

/** Runs inside the account-deletion transaction before wallet/history removal. */
export async function purgeSpeechActor(
    tx: AiCreditTransaction,
    actorId: string,
    _now: Date,
    authorization?: { workerId: string; fencingToken: number },
): Promise<void> {
    if (!authorization)
        throw new Error(
            'Speech purge requires the expected deletion worker and fencing token.',
        );
    await tx.execute(
        sql`select set_config('languon.speech_worker_version','1',true)`,
    );
    await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${actorId},76021941))`,
    );
    await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${'actor:' + actorId}, 1920424383))`,
    );
    await lockSpeechWalletOwner(tx, actorId);
    await tx.execute(
        sql`select languon_finalize_speech_accounting_for_purge(${actorId}::uuid,${authorization.workerId},${authorization.fencingToken}::integer)`,
    );
    await tx.execute(
        sql`select languon_purge_private_knowledge_speech(${actorId}::uuid,${authorization.workerId},${authorization.fencingToken}::integer)`,
    );
}

/** Authenticated account scheduling uses cancellation before a purge lease is due. */
export async function cancelSpeechActorForScheduledDeletion(
    tx: AiCreditTransaction,
    actorId: string,
): Promise<void> {
    await tx.execute(
        sql`select languon_cancel_speech_for_scheduled_deletion(${actorId}::uuid)`,
    );
}
