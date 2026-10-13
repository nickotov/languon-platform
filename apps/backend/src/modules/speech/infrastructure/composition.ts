import { dictionaryAudioBudget } from '../../dictionaries/infrastructure/audio/dictionary-audio-budget';
import { randomBytes } from 'node:crypto';
import type { PostgresJsDatabase } from '@languon/database';
import type { databaseSchema } from '../../../infrastructure/database/schema';
import type { loadDictionaryAudioEnvironment } from '../../dictionaries/infrastructure/audio/dictionary-audio-environment';
import { HmacDictionaryCryptography } from '../../dictionaries/infrastructure/crypto/dictionary-cryptography';
import type {
    AudioObjectStorage,
    SpeechProfileResolver,
    SpeechSynthesisProvider,
} from '../application/ports';
import { SpeechService } from '../application/speech-service';
import { SpeechWorker } from '../application/speech-worker';
import { DrizzleSpeechSourceResolver } from './source-resolver';
import { DrizzleSpeechStore } from './drizzle-speech-store';

export function createSpeechInfrastructure(input: {
    database: PostgresJsDatabase<typeof databaseSchema>;
    dictionaryHmacSecret: string;
    environment: ReturnType<typeof loadDictionaryAudioEnvironment>;
    storage: AudioObjectStorage;
    provider: SpeechProfileResolver;
    providers: ReadonlyMap<string, SpeechSynthesisProvider>;
    playbackEnabled: boolean;
    generationEnabled: boolean;
}) {
    const resolver = new DrizzleSpeechSourceResolver(
        input.database,
        new HmacDictionaryCryptography({
            secret: input.dictionaryHmacSecret,
            entropy: { randomBytes },
        }),
    );
    const budget = dictionaryAudioBudget(input.environment);
    const store = new DrizzleSpeechStore({
        database: input.database,
        fingerprintSecret:
            input.environment.fingerprintSecret ?? input.dictionaryHmacSecret,
        profileResolver: input.provider,
        storageIdentity: input.storage.identity,
        generationEnabled: input.generationEnabled,
        playbackEnabled: input.playbackEnabled,
        revalidateSource: (actorId, source, transaction) =>
            resolver.resolveInTransaction(actorId, source, transaction),
        maxCharacters: input.environment.maxCharacters,
        retainedFingerprintSecrets:
            input.environment.retainedFingerprintSecrets,
        ownerQueuedLimit: budget.ownerQueued,
        ownerActiveLimit: budget.ownerActive,
        globalActiveLimit: budget.globalActive,
        maxCostUnitsPerClip: budget.maxCostPerClip ?? 10000,
        ownerBudgetUnits: budget.ownerDailyCost,
        globalBudgetUnits: budget.globalDailyCost,
    });
    return {
        store,
        resolver,
        service: new SpeechService({ store, resolver, storage: input.storage }),
        worker: new SpeechWorker({
            store,
            providers: input.providers,
            storage: input.storage,
        }),
    };
}
