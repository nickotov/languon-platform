import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { createDrizzleDatabase, createPostgresClient } from '@languon/database';
import { loadEnvironment } from '../config/environment';
import { databaseSchema } from '../infrastructure/database/schema';
import { HmacDictionaryCryptography } from '../modules/dictionaries/infrastructure/crypto/dictionary-cryptography';
import { loadDictionaryAudioEnvironment } from '../modules/speech/infrastructure/audio/dictionary-audio-environment';
import { createDictionaryAudioAdapters } from '../modules/speech/infrastructure/audio/dictionary-audio-adapters';
import { DrizzleSpeechSourceResolver } from '../modules/speech/infrastructure/source-resolver';
import {
    LegacySpeechMigration,
    LegacySpeechMigrationBlockedError,
} from '../modules/speech/infrastructure/legacy-migration';

const localEnvironmentFile = new URL('../../../../.env.local', import.meta.url);
if (existsSync(localEnvironmentFile)) loadEnvFile(localEnvironmentFile);
if (process.env.ALLOW_SPEECH_MIGRATION !== 'true')
    throw new Error(
        'Speech migration requires ALLOW_SPEECH_MIGRATION=true after legacy workers have been drained.',
    );
const environment = loadEnvironment();
const deployed =
    environment.APP_ENV === 'staging' || environment.APP_ENV === 'production';
const audioEnvironment = loadDictionaryAudioEnvironment(process.env, {
    deployed,
    role: 'purge',
});
if (audioEnvironment.generationEnabled || environment.SPEECH_GENERATION_ENABLED)
    throw new Error(
        'Disable both legacy and shared generation before migrating.',
    );
const client = createPostgresClient({
    databaseUrl: environment.DATABASE_URL,
    maxConnections: 2,
});
const database = createDrizzleDatabase(client, databaseSchema);
const adapters = createDictionaryAudioAdapters({
    environment: audioEnvironment,
    database,
    role: 'purge',
});
try {
    const resolver = new DrizzleSpeechSourceResolver(
        database,
        new HmacDictionaryCryptography({
            secret: environment.DICTIONARY_HMAC_SECRET,
            entropy: { randomBytes },
        }),
    );
    const migration = new LegacySpeechMigration({
        database,
        resolver,
        storage: adapters.storage,
        fingerprintSecret:
            audioEnvironment.fingerprintSecret ??
            environment.DICTIONARY_HMAC_SECRET,
        retainedFingerprintSecrets: audioEnvironment.retainedFingerprintSecrets,
    });
    const report = await migration.run();
    process.stdout.write(`${JSON.stringify(report)}\n`);
} catch (error) {
    // No raw source content, database URL, storage credentials, or SDK errors in CLI output.
    process.stderr.write(
        error instanceof LegacySpeechMigrationBlockedError
            ? `${error.message}\n`
            : 'Speech migration failed. Preserve inventory and retry after resolving the failure.\n',
    );
    process.exitCode = 1;
} finally {
    adapters.close();
    await client.end();
}
