import { dictionaryAiWorkerObservationsTable } from '../persistence/drizzle/configuration-schema';
import {
    textAiCapacityObservationId,
    sentenceExecutionObservationId,
    textsCapacityObservationId,
    textsExecutionObservationId,
    conversationCapacityObservationId,
    conversationExecutionObservationId,
    portraitInterviewExecutionObservationId,
} from '../persistence/drizzle/text-ai-worker-readiness';
import { lte } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type { databaseSchema } from '../../../../infrastructure/database/schema';
import {
    textAiModelCatalog,
    textAiTextsFormats,
} from '../../application/text-ai-provider-catalog';

import {
    createTextAiProviderReadiness,
    findTextAiModel,
} from './text-ai-provider-catalog';

type ObservationDatabase = PostgresJsDatabase<typeof databaseSchema>;

export type TextAiWorkerCredentials = Partial<
    Record<'DEEPSEEK_API_KEY' | 'KIE_API_KEY', string>
>;

export async function publishTextAiWorkerObservations(options: {
    credentials: TextAiWorkerCredentials;
    database: ObservationDatabase;
    fetchProvider?: typeof fetch;
    now?: Date;
    readinessTimeoutMs: number;
    learningExecutionEnabled?: boolean;
    textsExecutionEnabled?: boolean;
    textsCapacityEnabled?: boolean;
    conversationCapacityEnabled?: boolean;
    conversationExecutionEnabled?: boolean;
    portraitInterviewExecutionEnabled?: boolean;
    sentencePreparationExecutionEnabled?: boolean;
    supportedFormats: readonly string[];
    ttlMs?: number;
    workerId: string;
}): Promise<void> {
    const checkedAt = options.now ?? new Date();
    const expiresAt = new Date(
        checkedAt.getTime() + (options.ttlMs ?? 120_000),
    );

    for (const model of textAiModelCatalog) {
        const catalogModel = findTextAiModel(`${model.providerId}/${model.id}`);
        if (!catalogModel) continue;
        const credential = options.credentials[model.credentialReference];
        const supportedFormats = [
            ...new Set(
                options.supportedFormats.filter((format) =>
                    model.supportedFormats.includes(format),
                ),
            ),
        ];
        if (
            options.learningExecutionEnabled &&
            options.sentencePreparationExecutionEnabled
        ) {
            for (const revision of [1, 2]) {
                if (
                    supportedFormats.includes(
                        `sentence-generation:v${revision}`,
                    )
                )
                    supportedFormats.push(`sentence-preparation:v${revision}`);
            }
        }
        let status: 'available' | 'unavailable' | 'unverified' = 'unavailable';
        let message = 'Provider credential is unavailable in the worker.';

        if (credential) {
            try {
                await createTextAiProviderReadiness({
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

        const publish = async (
            formats: readonly string[],
            learning: boolean,
            texts: boolean = false,
            capacity: boolean = false,
            conversationCapacity: boolean = false,
            conversationExecution: boolean = false,
            portraitInterviewExecution: boolean = false,
        ) => {
            if (formats.length === 0) return;
            await options.database
                .insert(dictionaryAiWorkerObservationsTable)
                .values({
                    adapterRevision: model.adapterRevision,
                    textAiSelectionRevision: 1,
                    textAiCapacityRevision: 1,
                    textsCapacityRevision: options.textsCapacityEnabled
                        ? 1
                        : null,
                    textsExecutionRevision: texts ? 1 : null,
                    conversationCapacityRevision:
                        options.conversationCapacityEnabled ? 1 : null,
                    conversationExecutionRevision:
                        conversationExecution || portraitInterviewExecution
                            ? 1
                            : null,
                    learningExecutionRevision: learning ? 1 : null,
                    creditSettlementRevision:
                        learning ||
                        texts ||
                        conversationExecution ||
                        portraitInterviewExecution
                            ? 1
                            : null,
                    textAiSupportedFormats: [...formats],
                    checkedAt,
                    expiresAt,
                    id: (portraitInterviewExecution
                        ? portraitInterviewExecutionObservationId
                        : conversationExecution
                          ? conversationExecutionObservationId
                          : conversationCapacity
                            ? conversationCapacityObservationId
                            : texts
                              ? textsExecutionObservationId
                              : capacity
                                ? textsCapacityObservationId
                                : learning
                                  ? sentenceExecutionObservationId
                                  : textAiCapacityObservationId)(
                        options.workerId,
                        model.providerId,
                        model.id,
                    ),
                    message,
                    modelId: model.id,
                    providerId: model.providerId,
                    status,
                    workerId: options.workerId,
                })
                .onConflictDoUpdate({
                    set: {
                        adapterRevision: model.adapterRevision,
                        textAiSelectionRevision: 1,
                        textAiCapacityRevision: 1,
                        textsCapacityRevision: options.textsCapacityEnabled
                            ? 1
                            : null,
                        textsExecutionRevision: texts ? 1 : null,
                        conversationCapacityRevision:
                            options.conversationCapacityEnabled ? 1 : null,
                        conversationExecutionRevision:
                            conversationExecution || portraitInterviewExecution
                                ? 1
                                : null,
                        learningExecutionRevision: learning ? 1 : null,
                        creditSettlementRevision:
                            learning ||
                            texts ||
                            conversationExecution ||
                            portraitInterviewExecution
                                ? 1
                                : null,
                        textAiSupportedFormats: [...formats],
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
        };
        const sentenceFormats = [
            'sentence-generation:v1',
            'sentence-generation:v2',
            'sentence-preparation:v1',
            'sentence-preparation:v2',
            'sentence-check:v1',
        ];
        await publish(
            supportedFormats.filter(
                (format) =>
                    format !== 'conversation:v1' &&
                    format !== 'portrait-interview:v1' &&
                    !sentenceFormats.includes(format) &&
                    !textAiTextsFormats.some(
                        (candidate) => candidate === format,
                    ),
            ),
            false,
        );
        if (options.textsCapacityEnabled)
            await publish(
                supportedFormats.filter(
                    (format) =>
                        format !== 'conversation:v1' &&
                        format !== 'portrait-interview:v1' &&
                        !textAiTextsFormats.some(
                            (candidate) => candidate === format,
                        ),
                ),
                false,
                false,
                true,
            );
        if (options.textsExecutionEnabled)
            if (options.textsCapacityEnabled)
                await publish(
                    supportedFormats.filter((format) =>
                        textAiTextsFormats.some(
                            (candidate) => candidate === format,
                        ),
                    ),
                    false,
                    true,
                );
        if (
            options.conversationCapacityEnabled &&
            options.textsCapacityEnabled
        ) {
            await publish(
                supportedFormats.filter(
                    (format) =>
                        format !== 'conversation:v1' &&
                        format !== 'portrait-interview:v1',
                ),
                !!options.learningExecutionEnabled,
                !!options.textsExecutionEnabled,
                false,
                true,
            );
            if (options.conversationExecutionEnabled)
                await publish(
                    supportedFormats.filter(
                        (format) => format === 'conversation:v1',
                    ),
                    false,
                    false,
                    false,
                    false,
                    true,
                );
        }
        if (
            options.portraitInterviewExecutionEnabled &&
            options.conversationCapacityEnabled &&
            options.textsCapacityEnabled
        ) {
            await publish(
                supportedFormats.filter(
                    (format) => format === 'portrait-interview:v1',
                ),
                false,
                false,
                false,
                false,
                false,
                true,
            );
        }
        if (options.learningExecutionEnabled)
            await publish(
                supportedFormats.filter((format) =>
                    sentenceFormats.includes(format),
                ),
                true,
            );
    }
}
