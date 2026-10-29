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

/** API admission gate; workers must continue draining already admitted jobs. */
export function textsAiAdmissionsEnabled(
    environment: Record<string, string | undefined>,
): boolean {
    if (environment.TEXTS_AI_ENABLED !== 'true') return false;
    if (
        !['staging', 'production'].includes(
            environment.APP_ENV ?? 'development',
        )
    )
        return true;
    const required = [
        'text-detection:v2',
        'text-translation:v3',
        'text-selection-card:v1',
    ];
    const api = (environment.DICTIONARY_JOB_API_ENQUEUED_FORMATS ?? '')
        .split(',')
        .map((value) => value.trim());
    const workers = (
        environment.DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS ?? ''
    )
        .split(',')
        .map((value) => value.trim());
    return required.every(
        (format) => api.includes(format) && workers.includes(format),
    );
}

/** New knowledge actions must not disable the existing Texts journeys during rollout. */
export function knowledgeTextAiAdmissionsEnabled(
    environment: Record<string, string | undefined>,
): boolean {
    if (!textsAiAdmissionsEnabled(environment)) return false;
    if (
        !['staging', 'production'].includes(
            environment.APP_ENV ?? 'development',
        )
    )
        return true;
    return [
        'DICTIONARY_JOB_API_ENQUEUED_FORMATS',
        'DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS',
    ].every((key) =>
        (environment[key] ?? '')
            .split(',')
            .map((value) => value.trim())
            .includes('text-translation:v4'),
    );
}
