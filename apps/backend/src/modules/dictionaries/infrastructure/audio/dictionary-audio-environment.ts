import { z } from 'zod';
import type { SpeechProfile } from '../../application/ports/speech-synthesis-provider';

const optional = z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().min(1).optional(),
);
const positive = z.coerce.number().int().positive();
const schema = z.object({
    DICTIONARY_AUDIO_PLAYBACK_ENABLED: z
        .enum(['true', 'false'])
        .default('false'),
    DICTIONARY_AUDIO_GENERATION_ENABLED: z
        .enum(['true', 'false'])
        .default('false'),
    DICTIONARY_AUDIO_STORAGE: z.enum(['postgres', 's3']).default('postgres'),
    DICTIONARY_AUDIO_PROVIDER: z.enum(['fixture', 'kie']).default('fixture'),
    DICTIONARY_AUDIO_CONFIGURATION_ID: z
        .string()
        .min(1)
        .max(128)
        .default('kie-v1'),
    DICTIONARY_AUDIO_KIE_API_KEY: optional,
    DICTIONARY_AUDIO_VOICE_MAP: optional,
    DICTIONARY_AUDIO_DOWNLOAD_HOSTS: optional,
    DICTIONARY_AUDIO_RETAINED_KIE_CONFIGURATIONS: optional,
    DICTIONARY_AUDIO_RETAINED_S3_CONFIGURATIONS: optional,
    DICTIONARY_AUDIO_FINGERPRINT_SECRET: optional,
    DICTIONARY_AUDIO_OWNER_BUDGET_UNITS: optional,
    DICTIONARY_AUDIO_GLOBAL_BUDGET_UNITS: optional,
    DICTIONARY_AUDIO_OWNER_QUEUED_LIMIT: positive.max(100).default(10),
    DICTIONARY_AUDIO_MAX_CHARACTERS: positive.max(2000).default(2000),
    DICTIONARY_AUDIO_MAX_COST_UNITS_PER_CLIP: positive.default(10000),
    DICTIONARY_AUDIO_OWNER_ACTIVE_LIMIT: positive.max(10).default(2),
    DICTIONARY_AUDIO_GLOBAL_ACTIVE_LIMIT: positive.max(32).default(4),
    DICTIONARY_AUDIO_S3_ENDPOINT: optional,
    DICTIONARY_AUDIO_S3_BUCKET: optional,
    DICTIONARY_AUDIO_S3_REGION: optional,
    DICTIONARY_AUDIO_S3_ACCESS_KEY_ID: optional,
    DICTIONARY_AUDIO_S3_SECRET_ACCESS_KEY: optional,
    DICTIONARY_AUDIO_S3_FORCE_PATH_STYLE: z
        .enum(['true', 'false'])
        .default('false'),
});
const voicesSchema = z.record(
    z.string().regex(/^[a-z]{2,3}$/),
    z.object({
        model: z.literal('elevenlabs/text-to-speech-turbo-2-5'),
        voice: z.string().min(1).max(128),
        estimatedCostUnitsPerCharacter: z.number().finite().positive(),
        settingsVersion: z.string().min(1).default('1'),
    }),
);
const downloadHostSchema = z
    .string()
    .regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/u);
const retainedConfigurationsSchema = z
    .array(
        z.object({
            configurationId: z.string().min(1).max(128),
            apiKey: z.string().min(1).max(4096),
            allowedDownloadHosts: z.array(downloadHostSchema).min(1).max(32),
        }),
    )
    .max(16);
const retainedStorageSchema = z
    .array(
        z.object({
            endpoint: z.string().url(),
            bucket: z.string().regex(/^[a-z0-9][a-z0-9.-]{2,62}$/),
            region: z.string().min(1),
            accessKeyId: z.string().min(1),
            secretAccessKey: z.string().min(1),
            forcePathStyle: z.boolean().default(false),
        }),
    )
    .max(16);

export function loadDictionaryAudioEnvironment(
    values: NodeJS.ProcessEnv,
    options: { deployed: boolean; role?: 'api' | 'worker' | 'purge' },
) {
    const env = schema.parse(values);
    const role = options.role ?? 'worker';
    const playbackEnabled = env.DICTIONARY_AUDIO_PLAYBACK_ENABLED === 'true';
    const generationEnabled =
        env.DICTIONARY_AUDIO_GENERATION_ENABLED === 'true';
    const enabled = playbackEnabled || generationEnabled;
    if (options.deployed && enabled && !env.DICTIONARY_AUDIO_FINGERPRINT_SECRET)
        throw new Error(
            'Deployed audio requires a dedicated fingerprint secret.',
        );
    const fingerprintSecret = z
        .string()
        .min(32)
        .parse(
            env.DICTIONARY_AUDIO_FINGERPRINT_SECRET ??
                'dictionary-audio-development-secret-only',
        );
    if (
        options.deployed &&
        enabled &&
        (env.DICTIONARY_AUDIO_STORAGE !== 's3' ||
            env.DICTIONARY_AUDIO_PROVIDER === 'fixture')
    )
        throw new Error(
            'Deployed audio requires S3 and a live speech provider.',
        );
    const profiles: Record<string, SpeechProfile> = {};
    if (env.DICTIONARY_AUDIO_VOICE_MAP) {
        for (const [language, profile] of Object.entries(
            voicesSchema.parse(JSON.parse(env.DICTIONARY_AUDIO_VOICE_MAP)),
        ))
            profiles[language] = {
                ...profile,
                language,
                provider: 'kie',
                configurationId: env.DICTIONARY_AUDIO_CONFIGURATION_ID,
            };
    }
    const allowedDownloadHosts = (env.DICTIONARY_AUDIO_DOWNLOAD_HOSTS ?? '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    const retainedConfigurations = retainedConfigurationsSchema.parse(
        JSON.parse(
            role === 'worker'
                ? (env.DICTIONARY_AUDIO_RETAINED_KIE_CONFIGURATIONS ?? '[]')
                : '[]',
        ),
    );
    const currentId =
        env.DICTIONARY_AUDIO_PROVIDER === 'fixture'
            ? 'fixture-v1'
            : env.DICTIONARY_AUDIO_CONFIGURATION_ID;
    const ids = retainedConfigurations.map((entry) => entry.configurationId);
    if (ids.includes(currentId) || new Set(ids).size !== ids.length)
        throw new Error('Speech configuration identifiers must be unique.');
    for (const host of allowedDownloadHosts)
        if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/u.test(host))
            throw new Error('Audio download hosts must be exact DNS names.');
    if (
        generationEnabled &&
        env.DICTIONARY_AUDIO_PROVIDER === 'kie' &&
        role !== 'purge' &&
        ((role === 'worker' &&
            (!env.DICTIONARY_AUDIO_KIE_API_KEY ||
                !allowedDownloadHosts.length)) ||
            !Object.keys(profiles).length ||
            !env.DICTIONARY_AUDIO_OWNER_BUDGET_UNITS ||
            !env.DICTIONARY_AUDIO_GLOBAL_BUDGET_UNITS)
    )
        throw new Error(
            'Live audio requires explicit credentials, voices, download hosts, and spend budgets.',
        );
    let s3:
        | {
              endpoint: string;
              bucket: string;
              region: string;
              accessKeyId: string;
              secretAccessKey: string;
              forcePathStyle: boolean;
          }
        | undefined;
    if (env.DICTIONARY_AUDIO_STORAGE === 's3') {
        const endpoint = new URL(
            z.string().url().parse(env.DICTIONARY_AUDIO_S3_ENDPOINT),
        );
        if (
            endpoint.username ||
            endpoint.password ||
            endpoint.search ||
            endpoint.hash ||
            endpoint.pathname !== '/' ||
            (options.deployed
                ? endpoint.protocol !== 'https:'
                : !['http:', 'https:'].includes(endpoint.protocol))
        )
            throw new Error('Invalid audio storage endpoint.');
        s3 = {
            endpoint: endpoint.origin,
            bucket: z
                .string()
                .regex(/^[a-z0-9][a-z0-9.-]{2,62}$/)
                .parse(env.DICTIONARY_AUDIO_S3_BUCKET),
            region: z.string().min(1).parse(env.DICTIONARY_AUDIO_S3_REGION),
            accessKeyId: z
                .string()
                .min(1)
                .parse(env.DICTIONARY_AUDIO_S3_ACCESS_KEY_ID),
            secretAccessKey: z
                .string()
                .min(1)
                .parse(env.DICTIONARY_AUDIO_S3_SECRET_ACCESS_KEY),
            forcePathStyle: env.DICTIONARY_AUDIO_S3_FORCE_PATH_STYLE === 'true',
        };
    }
    const retainedStorages = retainedStorageSchema
        .parse(
            JSON.parse(env.DICTIONARY_AUDIO_RETAINED_S3_CONFIGURATIONS ?? '[]'),
        )
        .map((storage) => {
            const endpoint = new URL(storage.endpoint);
            if (
                endpoint.username ||
                endpoint.password ||
                endpoint.search ||
                endpoint.hash ||
                endpoint.pathname !== '/' ||
                (options.deployed
                    ? endpoint.protocol !== 'https:'
                    : !['http:', 'https:'].includes(endpoint.protocol))
            )
                throw new Error('Invalid retained audio storage endpoint.');
            return { ...storage, endpoint: endpoint.origin };
        });
    const storageIds = [...(s3 ? [s3] : []), ...retainedStorages].map(
        (storage) => `${storage.endpoint}/${storage.bucket}`,
    );
    if (new Set(storageIds).size !== storageIds.length)
        throw new Error('Audio storage identities must be unique.');
    return {
        playbackEnabled,
        fingerprintSecret,
        generationEnabled,
        provider: env.DICTIONARY_AUDIO_PROVIDER,
        storage: env.DICTIONARY_AUDIO_STORAGE,
        configurationId: env.DICTIONARY_AUDIO_CONFIGURATION_ID,
        apiKey:
            role === 'worker' ? env.DICTIONARY_AUDIO_KIE_API_KEY : undefined,
        profiles,
        allowedDownloadHosts,
        retainedConfigurations,
        retainedStorages,
        s3,
        ownerBudgetUnits: positive.parse(
            env.DICTIONARY_AUDIO_OWNER_BUDGET_UNITS ?? '10000',
        ),
        globalBudgetUnits: positive.parse(
            env.DICTIONARY_AUDIO_GLOBAL_BUDGET_UNITS ?? '100000',
        ),
        ownerQueuedLimit: env.DICTIONARY_AUDIO_OWNER_QUEUED_LIMIT,
        maxCharacters: env.DICTIONARY_AUDIO_MAX_CHARACTERS,
        maxCostPerClip: env.DICTIONARY_AUDIO_MAX_COST_UNITS_PER_CLIP,
        ownerActiveLimit: env.DICTIONARY_AUDIO_OWNER_ACTIVE_LIMIT,
        globalActiveLimit: env.DICTIONARY_AUDIO_GLOBAL_ACTIVE_LIMIT,
    };
}
export type DictionaryAudioEnvironment = ReturnType<
    typeof loadDictionaryAudioEnvironment
>;
