import { lte } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type { databaseSchema } from '../../../../infrastructure/database/schema';
import { dictionaryAiModelCatalog } from '../../application/dictionary-ai-provider-catalog';
import { dictionaryAiWorkerObservationsTable } from '../persistence/drizzle/schema';
import {
    createDictionaryTextProviderReadiness,
    findDictionaryTextModel,
} from './dictionary-text-provider-catalog';

type ObservationDatabase = PostgresJsDatabase<typeof databaseSchema>;

export type DictionaryAiWorkerCredentials = Partial<
    Record<'DEEPSEEK_API_KEY' | 'KIE_API_KEY', string>
>;

export async function publishDictionaryAiWorkerObservations(options: {
    credentials: DictionaryAiWorkerCredentials;
    database: ObservationDatabase;
    fetchProvider?: typeof fetch;
    now?: Date;
    readinessTimeoutMs: number;
    ttlMs?: number;
    workerId: string;
}): Promise<void> {
    const checkedAt = options.now ?? new Date();
    const expiresAt = new Date(
        checkedAt.getTime() + (options.ttlMs ?? 120_000),
    );

    for (const model of dictionaryAiModelCatalog) {
        const catalogModel = findDictionaryTextModel(
            `${model.providerId}/${model.id}`,
        );
        if (!catalogModel) continue;
        const credential = options.credentials[model.credentialReference];
        let status: 'available' | 'unavailable' | 'unverified' = 'unavailable';
        let message = 'Provider credential is unavailable in the worker.';

        if (credential) {
            try {
                await createDictionaryTextProviderReadiness({
                    apiKey: credential,
                    ...(options.fetchProvider
                        ? { fetchProvider: options.fetchProvider }
                        : {}),
                    readiness: catalogModel.readiness,
                })(AbortSignal.timeout(options.readinessTimeoutMs));
                if (catalogModel.readiness.method === 'HEAD') {
                    status = 'unverified';
                    message =
                        'Provider route is reachable; credential and model readiness remain unverified.';
                } else {
                    status = 'available';
                    message = 'Worker readiness probe succeeded.';
                }
            } catch {
                message = 'Worker readiness probe failed.';
            }
        }

        await options.database
            .insert(dictionaryAiWorkerObservationsTable)
            .values({
                adapterRevision: model.adapterRevision,
                checkedAt,
                expiresAt,
                id: `${options.workerId}/${model.providerId}/${model.id}`,
                message,
                modelId: model.id,
                providerId: model.providerId,
                status,
                workerId: options.workerId,
            })
            .onConflictDoUpdate({
                set: {
                    adapterRevision: model.adapterRevision,
                    checkedAt,
                    expiresAt,
                    message,
                    modelId: model.id,
                    providerId: model.providerId,
                    status,
                    workerId: options.workerId,
                },
                setWhere: lte(
                    dictionaryAiWorkerObservationsTable.checkedAt,
                    checkedAt,
                ),
                target: dictionaryAiWorkerObservationsTable.id,
            });
    }
}
