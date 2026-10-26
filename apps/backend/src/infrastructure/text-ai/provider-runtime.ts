import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../database/schema';
import type { TextAiProviderCredentials } from '../../modules/text-ai/application/text-ai-provider-catalog';
import type { TextAiProviderRuntimeOptions } from '../../modules/text-ai/infrastructure/ai/text-ai-provider-runtime-observer';
import { createTextAiRouteHealthRecorder } from '../../modules/text-ai/infrastructure/ai/text-ai-route-health';
import { createTextAiRouteFingerprint } from './route-fingerprint';

/** Process composition binds current credentials and durable health, not caller input. */
export function createTextAiProviderRuntime(
    database: PostgresJsDatabase<typeof databaseSchema>,
    credentials: Readonly<TextAiProviderCredentials>,
): TextAiProviderRuntimeOptions {
    return {
        currentFingerprint: createTextAiRouteFingerprint(credentials),
        onProviderFailure: createTextAiRouteHealthRecorder(database),
    };
}
