import { S3Client } from '@aws-sdk/client-s3';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
    PostgresAudioObjectStorage,
    RoutingAudioObjectStorage,
    S3AudioObjectStorage,
} from './audio-object-storages';
import type { DictionaryAudioEnvironment } from './dictionary-audio-environment';
import { KieSpeechProvider } from './speech-providers';
import {
    createSpeechProvider,
    resolveSpeechProvider,
} from './speech-provider-registry';
import type { SpeechSynthesisProvider } from '../../application/ports/speech-synthesis-provider';
import type { AudioObjectStorage } from '../../application/ports/audio-object-storage';

type AdapterOptions = {
    environment: DictionaryAudioEnvironment;
    database: Pick<PostgresJsDatabase, 'execute'>;
    role?: 'api' | 'worker';
};
type ProfileResolver = Pick<
    SpeechSynthesisProvider,
    'configurationId' | 'supports'
>;
type AdapterResult<P extends ProfileResolver> = {
    storage: AudioObjectStorage;
    provider: P;
    providers: Map<string, SpeechSynthesisProvider>;
    close(): void;
};

export function createDictionaryAudioAdapters(
    options: AdapterOptions & { role: 'api' },
): AdapterResult<ProfileResolver>;
export function createDictionaryAudioAdapters(
    options: AdapterOptions & { role?: 'worker' },
): AdapterResult<SpeechSynthesisProvider>;

export function createDictionaryAudioAdapters(
    options: AdapterOptions,
): AdapterResult<ProfileResolver> {
    const env = options.environment;
    const clients: S3Client[] = [];
    const createS3 = (
        configuration: NonNullable<DictionaryAudioEnvironment['s3']>,
    ) => {
        const client = new S3Client({
            endpoint: configuration.endpoint,
            region: configuration.region,
            forcePathStyle: configuration.forcePathStyle,
            credentials: {
                accessKeyId: configuration.accessKeyId,
                secretAccessKey: configuration.secretAccessKey,
            },
            maxAttempts: 2,
            requestHandler: { connectionTimeout: 5000, requestTimeout: 10000 },
        });
        clients.push(client);
        return new S3AudioObjectStorage({
            client,
            bucket: configuration.bucket,
            namespace: `${configuration.endpoint}/${configuration.bucket}`,
        });
    };
    const postgres = new PostgresAudioObjectStorage(options.database);
    const primary = env.s3 ? createS3(env.s3) : postgres;
    const storage = new RoutingAudioObjectStorage(primary, [
        ...(env.s3 ? [postgres] : []),
        ...env.retainedStorages.map(createS3),
    ]);
    const close = () => {
        for (const client of clients) client.destroy();
    };
    if (options.role === 'api') {
        // Metadata resolution cannot execute paid work and holds no provider credentials.
        const resolved = resolveSpeechProvider(env);
        const provider: ProfileResolver = resolved;
        return { storage, provider, providers: new Map(), close };
    }
    const provider = createSpeechProvider(env);
    const providers = new Map<string, SpeechSynthesisProvider>([
        [provider.configurationId, provider],
    ]);
    for (const retained of env.retainedConfigurations) {
        // Historical adapters deliberately expose no capabilities for new submissions.
        // Persisted task profiles supply their original voice/model/settings during polling.
        providers.set(
            retained.configurationId,
            new KieSpeechProvider({ ...retained, profiles: {} }),
        );
    }
    return {
        storage,
        provider,
        providers,
        close,
    };
}
