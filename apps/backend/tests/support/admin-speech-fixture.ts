/** Synthetic tone fixture using real saved-source admission, storage and worker.
 * Guarded to disposable local administration E2E databases; never calls Kie. */
import { randomUUID, randomBytes } from 'node:crypto';
import { createDrizzleDatabase, createPostgresClient } from '@languon/database';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { SpeechSource } from '@languon/contracts';
import { aiAccountingSettingsRevisionsTable as accountingSettings } from '../../src/modules/ai-credits/infrastructure/persistence/drizzle/capability-policy-schema';
import { aiProviderPriceRevisionsTable as providerPrices } from '../../src/modules/ai-credits/infrastructure/persistence/drizzle/provider-price-schema';
import { databaseSchema } from '../../src/infrastructure/database/schema';
import { DrizzleDictionaryStore } from '../../src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-store';
import { HmacDictionaryCryptography } from '../../src/modules/dictionaries/infrastructure/crypto/dictionary-cryptography';
import { DrizzleSpeechSourceResolver } from '../../src/modules/speech/infrastructure/source-resolver';
import { DrizzleSpeechStore } from '../../src/modules/speech/infrastructure/drizzle-speech-store';
import { PostgresAudioObjectStorage } from '../../src/modules/speech/infrastructure/audio/audio-object-storages';
import { FixtureSpeechProvider } from '../../src/modules/speech/infrastructure/audio/speech-providers';
import { SpeechWorker } from '../../src/modules/speech/application/speech-worker';
import { SpeechService } from '../../src/modules/speech/application/speech-service';
import {
    speechBindingsTable,
    speechRecordingsTable,
} from '../../src/modules/speech/infrastructure/schema';

const url = process.env.ADMIN_E2E_DATABASE_URL;
if (
    process.env.APP_ENV !== 'test' ||
    process.env.ADMIN_E2E_SPEECH_FIXTURES !== 'true' ||
    !url
)
    throw new Error('Explicit test-only speech fixture opt-in is required.');
const target = new URL(url);
if (
    !['localhost', '127.0.0.1'].includes(target.hostname) ||
    !/(?:admin.*e2e|e2e.*admin).*test/i.test(target.pathname) ||
    !target.port ||
    target.port === '5432'
)
    throw new Error(
        'A dedicated disposable loopback admin E2E database on a nondefault port is required.',
    );
const [mode, actorId, value, cardId] = process.argv.slice(2);
if (!actorId || !/^[0-9a-f-]{36}$/i.test(actorId))
    throw new Error('A fixture actor UUID is required.');
const fixtureActorId: string = actorId;
const client = createPostgresClient({ databaseUrl: url, maxConnections: 2 });
const database = createDrizzleDatabase(client, databaseSchema);
const storage = new PostgresAudioObjectStorage(database);
const provider = new FixtureSpeechProvider();
const secret = 'admin-speech-e2e-synthetic-fingerprint-secret';
const resolver = new DrizzleSpeechSourceResolver(
    database,
    new HmacDictionaryCryptography({ secret, entropy: { randomBytes } }),
);
const store = new DrizzleSpeechStore({
    database,
    fingerprintSecret: secret,
    profileResolver: provider,
    storageIdentity: storage.identity,
    generationEnabled: true,
    playbackEnabled: true,
    revalidateSource: (actor, source, tx) =>
        resolver.resolveInTransaction(actor, source, tx),
});
const service = new SpeechService({
    store,
    resolver,
    storage,
    burstLimiter: { consume: async () => ({ allowed: true }) },
});
/** Seed only the operator prerequisites for this synthetic Free fixture. */
async function seedSpeechAccounting() {
    await database.transaction(async (tx) => {
        await tx.execute(
            sql`select pg_advisory_xact_lock(hashtextextended('admin-speech-fixture-accounting',0))`,
        );
        const at = new Date('2026-01-01T00:00:00.000Z');
        const [settings] = await tx
            .select()
            .from(accountingSettings)
            .orderBy(desc(accountingSettings.version))
            .limit(1);
        if (
            !settings?.maxProviderCostUsdPerAction ||
            !settings.maxProviderCostUsdPerAccountDay ||
            !settings.maxProviderCostUsdPerDay
        ) {
            await tx.insert(accountingSettings).values({
                id: randomUUID(),
                version: (settings?.version ?? 0) + 1,
                defaultMaxCreditsPerAction:
                    settings?.defaultMaxCreditsPerAction ?? null,
                maxProviderCostUsdPerAction: '1',
                maxProviderCostUsdPerAccountDay: '1000',
                maxProviderCostUsdPerDay: '10000',
                createdAt: at,
                reason: 'Synthetic admin speech operator allowances',
            });
        }
        const [price] = await tx
            .select()
            .from(providerPrices)
            .where(
                and(
                    eq(providerPrices.providerId, 'fixture'),
                    eq(providerPrices.modelId, 'tone-v1'),
                    eq(providerPrices.meter, 'speech-characters'),
                ),
            )
            .orderBy(desc(providerPrices.version))
            .limit(1);
        if (!price)
            await tx.insert(providerPrices).values({
                id: randomUUID(),
                providerId: 'fixture',
                modelId: 'tone-v1',
                meter: 'speech-characters',
                version: 1,
                effectiveAt: at,
                createdAt: at,
                data: {
                    providerId: 'fixture',
                    modelId: 'tone-v1',
                    meter: 'speech-characters',
                    inputUsdPerMillionTokens: null,
                    outputUsdPerMillionTokens: null,
                    cacheReadUsdPerMillionTokens: null,
                    cacheWriteUsdPerMillionTokens: null,
                    usdPer1000Characters: '0.001',
                    effectiveAt: at.toISOString(),
                    sourceReference: 'synthetic-pronunciation-provider-price',
                    sourceUrl: null,
                    reason: 'Synthetic reviewed pronunciation provider price',
                },
            });
    });
}

async function createSavedSource(text: string, label: string) {
    const now = new Date();
    const context = { now, signal: new AbortController().signal };
    const dictionaries = new DrizzleDictionaryStore(database, {
        generate: randomUUID,
    });
    const dictionary = await dictionaries.createDictionary({
        ownerId: fixtureActorId,
        context,
        idempotencyKey: randomUUID(),
        fingerprint: `hmac-sha256:v1:${'A'.repeat(43)}`,
        request: {
            name: `Admin speech fixture ${label}`,
            description: null,
            sourceLanguage: 'fr',
            targetLanguage: 'en',
        },
    });
    const created = await dictionaries.createCard({
        ownerId: fixtureActorId,
        dictionaryId: dictionary.id,
        context,
        request: {
            expectedDictionaryVersion: dictionary.version,
            expectedSettingsVersion: dictionary.settings.version,
            translationContext: null,
            values: {
                source: text,
                translation: 'synthetic greeting',
                transcription: null,
                definition: null,
                example: null,
                exampleTranslation: null,
            },
            overrides: {
                definitionEnabled: null,
                definitionLanguage: null,
                exampleEnabled: null,
                exampleLanguage: null,
                exampleTranslationEnabled: null,
                transcriptionEnabled: null,
                transcriptionNotation: null,
                transcriptionCustomLabel: null,
            },
        },
    });
    const source: SpeechSource = {
        kind: 'dictionary-field',
        access: { kind: 'owner', dictionaryId: dictionary.id },
        cardId: created.card.id,
        field: 'source',
    };
    return { dictionary, created, source };
}

try {
    if (mode === 'seed') {
        if (!value || !/^[a-zA-Z0-9-]{1,80}$/.test(value))
            throw new Error('Synthetic fixture run ID is required.');
        await seedSpeechAccounting();
        const text = `bonjour ${value}`;
        const { dictionary, created, source } = await createSavedSource(
            text,
            value,
        );
        const response = await service.prepare(actorId, {
            source,
            operationId: randomUUID(),
        });
        if (!response.requestId || response.state !== 'queued')
            throw new Error('Fixture did not admit free pronunciation.');
        const worker = new SpeechWorker({
            store,
            storage,
            providers: new Map([[provider.configurationId, provider]]),
        });
        for (let i = 0; i < 5; i++) {
            await worker.runOnce();
            if (
                (await service.status(actorId, response.requestId)).state ===
                'ready'
            )
                break;
        }
        const [binding] = await database
            .select()
            .from(speechBindingsTable)
            .where(eq(speechBindingsTable.id, response.requestId));
        if (
            !binding ||
            (await service.status(actorId, response.requestId)).state !==
                'ready'
        )
            throw new Error('Synthetic pronunciation did not become ready.');
        console.log(
            JSON.stringify({
                recordingId: binding.recordingId,
                dictionaryId: dictionary.id,
                cardId: created.card.id,
                text,
            }),
        );
    } else if (mode === 'join') {
        if (!value || !cardId)
            throw new Error(
                'Fixture dictionary and card identifiers are required.',
            );
        const original: SpeechSource = {
            kind: 'dictionary-field',
            access: { kind: 'owner', dictionaryId: value },
            cardId,
            field: 'source',
        };
        const resolved = await resolver.resolve(actorId, original);
        const { source } = await createSavedSource(
            resolved.text,
            `join-${randomUUID()}`,
        );
        if (
            (
                await service.prepare(actorId, {
                    source,
                    operationId: randomUUID(),
                })
            ).state !== 'ready'
        )
            throw new Error('Joining fixture did not reuse saved audio.');
        console.log(JSON.stringify({ joined: true }));
    } else if (mode === 'assert-deleted') {
        const [recording] = await database
            .select()
            .from(speechRecordingsTable)
            .where(eq(speechRecordingsTable.id, value!));
        if (
            !recording ||
            recording.state !== 'deleted' ||
            recording.text !== '' ||
            (await storage.read(recording.storage))
        )
            throw new Error('Deleted fixture retained text or audio.');
        const audit = await database.execute(
            sql`select id from admin_audit_events where actor_user_id=${actorId} and action='speech_recordings_deleted' and metadata->'recordingIds' @> ${JSON.stringify([value])}::jsonb`,
        );
        if (audit.length === 0)
            throw new Error('Fixture removal lacks an audit event.');
        console.log(
            JSON.stringify({
                deleted: true,
                textScrubbed: true,
                audioRemoved: true,
                audited: true,
            }),
        );
    } else throw new Error('Unsupported fixture operation.');
} finally {
    await client.end();
}
