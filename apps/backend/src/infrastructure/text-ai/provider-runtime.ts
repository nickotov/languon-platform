import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../database/schema';
import type { TextAiProviderCredentials } from '../../modules/text-ai/application/text-ai-provider-catalog';
import type { TextAiProviderRuntimeOptions } from '../../modules/text-ai/infrastructure/ai/text-ai-provider-runtime-observer';
import { createTextAiRouteHealthRecorder } from '../../modules/text-ai/infrastructure/ai/text-ai-route-health';
import { createTextAiRouteFingerprint } from './route-fingerprint';
import { sql } from 'drizzle-orm';
import { z } from 'zod';

/** Process composition binds current credentials and durable health, not caller input. */
export function createTextAiProviderRuntime(
    database: PostgresJsDatabase<typeof databaseSchema>,
    credentials: Readonly<TextAiProviderCredentials>,
): TextAiProviderRuntimeOptions {
    return {
        currentFingerprint: createTextAiRouteFingerprint(credentials),
        onProviderFailure: createTextAiRouteHealthRecorder(database),
        observeNativeCall: async ({ callId, usage, execution }) => {
            await database.execute(sql`select languon_observe_native_text_call(
                ${callId}::uuid, ${JSON.stringify({ usage, ...(execution ? { execution } : {}) })}::jsonb
            )`);
        },
        authorizeNativeCall: async ({ witness, inputTokens, outputTokens }) => {
            const result =
                await database.execute(sql`select languon_authorize_native_text_call(
                ${witness.attemptId}::uuid, ${inputTokens}::integer, ${outputTokens}::integer
            ) as receipt`);
            const receipt = z
                .object({ callId: z.uuid(), dispatchedAt: z.string() })
                .parse(result[0]?.receipt);
            return {
                ...receipt,
                dispatchedAt: new Date(receipt.dispatchedAt).toISOString(),
            };
        },
    };
}
