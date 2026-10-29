import { setTimeout as delay } from 'node:timers/promises';
import { and, desc, eq } from 'drizzle-orm';
import type { KnowledgeDatabase } from '../../src/modules/knowledge/infrastructure/persistence/drizzle/knowledge-transaction';
import type { RateLimiter } from '../../src/modules/authentication/application/ports/rate-limiter';
import type { AuthHttpPolicy } from '../../src/modules/authentication/interface/http/auth-http-policy';
import { createSpeechInfrastructure } from '../../src/modules/speech/infrastructure/composition';
import { loadDictionaryAudioEnvironment } from '../../src/modules/speech/infrastructure/audio/dictionary-audio-environment';
import { FixtureSpeechProvider } from '../../src/modules/speech/infrastructure/audio/speech-providers';
import { PostgresAudioObjectStorage } from '../../src/modules/speech/infrastructure/audio/audio-object-storages';
import { createSpeechRoutes } from '../../src/modules/speech/interface/http/speech.routes';
import { RedisGenerationBurstLimiter } from '../../src/modules/text-ai/infrastructure/generation-burst-limiter';
import { DrizzleProviderPriceStore } from '../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-provider-prices';
import { aiProviderPriceRevisionsTable as prices } from '../../src/modules/ai-credits/infrastructure/persistence/drizzle/provider-price-schema';

/** Browser tests retain real authentication, authorization, speech jobs, storage,
 * credits and asset import. Only the established tone synthesis provider is synthetic. */
export function createKnowledgeSpeechBrowserFixture(input: {
    database: KnowledgeDatabase;
    rateLimiter: RateLimiter;
    secret: string;
    authenticate(token: string): Promise<{ userId: string }>;
    policy: AuthHttpPolicy;
    clock: { now(): Date };
}) {
    const controller = new AbortController();
    let loop: Promise<void> | undefined;
    let workerFailed = false;
    const provider = new FixtureSpeechProvider();
    const environment = loadDictionaryAudioEnvironment(
        {
            SPEECH_PLAYBACK_ENABLED: 'true',
            SPEECH_GENERATION_ENABLED: 'true',
            DICTIONARY_AUDIO_PROVIDER: 'fixture',
            DICTIONARY_AUDIO_FINGERPRINT_SECRET:
                'synthetic-browser-knowledge-speech-v16',
        },
        { deployed: false, role: 'worker' },
    );
    const speech = createSpeechInfrastructure({
        database: input.database,
        dictionaryHmacSecret: input.secret,
        environment,
        storage: new PostgresAudioObjectStorage(input.database),
        provider,
        providers: new Map([[provider.configurationId, provider]]),
        playbackEnabled: true,
        generationEnabled: true,
        burstLimiter: new RedisGenerationBurstLimiter(input.rateLimiter),
    });
    return {
        speechRoutes: createSpeechRoutes({
            service: speech.service,
            policy: input.policy,
            authenticate: async (token) =>
                (await input.authenticate(token)).userId,
        }),
        readSpeech: (
            actorId: string,
            playbackId: string,
            signal: AbortSignal,
        ) => speech.service.content(actorId, playbackId, signal),
        async start(administratorId: string) {
            if (
                process.env.CONTEXTUAL_ASSISTANT_FIXTURE !== 'true' ||
                process.env.APP_ENV !== 'test'
            )
                throw new Error(
                    'Explicit contextual assistant test fixture opt-in required for tone speech.',
                );
            if (loop) return;
            const [existing] = await input.database
                .select({ version: prices.version })
                .from(prices)
                .where(
                    and(
                        eq(prices.providerId, 'fixture'),
                        eq(prices.modelId, 'tone-v1'),
                        eq(prices.meter, 'speech-characters'),
                    ),
                )
                .orderBy(desc(prices.version))
                .limit(1);
            if (!existing)
                await new DrizzleProviderPriceStore(input.database).publish(
                    {
                        expectedVersion: 0,
                        providerId: 'fixture',
                        modelId: 'tone-v1',
                        meter: 'speech-characters',
                        inputUsdPerMillionTokens: null,
                        outputUsdPerMillionTokens: null,
                        cacheReadUsdPerMillionTokens: null,
                        cacheWriteUsdPerMillionTokens: null,
                        usdPer1000Characters: '0.01',
                        effectiveAt: '2020-01-01T00:00:00.000Z',
                        sourceReference: 'synthetic-browser-tone-speech',
                        sourceUrl: null,
                        reason: 'Synthetic disposable browser speech provider tariff',
                    },
                    administratorId,
                    input.clock.now(),
                );
            loop = (async () => {
                while (!controller.signal.aborted) {
                    await speech.worker.runOnce(controller.signal);
                    await delay(25, undefined, { signal: controller.signal });
                }
            })().catch(() => {
                if (!controller.signal.aborted) workerFailed = true;
            });
        },
        async close() {
            controller.abort();
            await loop;
            if (workerFailed)
                throw new Error(
                    'Knowledge speech browser fixture worker failed.',
                );
        },
    };
}
