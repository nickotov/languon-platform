import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../../infrastructure/database/schema';
import { TextAiPreferenceService } from '../application/text-ai-preference-service';
import { DrizzleTextAiPreferenceStore } from './persistence/drizzle/drizzle-text-ai-preference-store';
import {
    createTextAiRoutes,
    type TextAiRouteDependencies,
} from '../interface/http/text-ai.routes';

export function createTextAiModule(
    input: Omit<TextAiRouteDependencies, 'preferences'> & {
        database: PostgresJsDatabase<typeof databaseSchema>;
    },
) {
    const preferences = new TextAiPreferenceService(
        new DrizzleTextAiPreferenceStore(input.database),
    );
    return {
        preferences,
        routes: createTextAiRoutes({ ...input, preferences }),
    };
}
