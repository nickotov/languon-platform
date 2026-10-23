import type { AdminAiSettingsResponse } from '@languon/contracts';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
    textAiModelCatalog as dictionaryAiModelCatalog,
    textAiTextFormats as dictionaryAiTextFormats,
    findTextAiModel as findDictionaryAiModel,
} from '../../../../text-ai/application/text-ai-provider-catalog';
import {
    dictionaryAiConfigurationRevisionsTable,
    dictionaryAiConfigurationTable,
    dictionaryAiWorkerObservationsTable,
} from '../../../../text-ai/infrastructure/persistence/drizzle/configuration-schema';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    AdminAccessDeniedError,
    AdminAiSettingsConflictError,
    AdminAiSettingsUnavailableError,
} from '../../../application/administration-errors';
import type { AdminAiSettingsMutationInput } from '../../../application/ports/administration-store';
import {
    auditValues,
    isDictionaryAiCredentialConfigured,
    type AdministrationStoreContext,
} from './administration-persistence-support';
import { assertActorCanMutate } from './administration-user-mutations';
import { activeOwnerMutationLock } from './owner-lock';
import { adminAuditEventsTable } from './schema';

export async function aiSettings(
    persistence: AdministrationStoreContext,
): Promise<AdminAiSettingsResponse> {
    const [[row], observations] = await Promise.all([
        persistence.database
            .select({
                activeRevisionId:
                    dictionaryAiConfigurationTable.activeRevisionId,
                snapshot:
                    dictionaryAiConfigurationRevisionsTable.catalogSnapshot,
                updatedAt: dictionaryAiConfigurationTable.updatedAt,
                version: dictionaryAiConfigurationTable.version,
            })
            .from(dictionaryAiConfigurationTable)
            .leftJoin(
                dictionaryAiConfigurationRevisionsTable,
                eq(
                    dictionaryAiConfigurationRevisionsTable.id,
                    dictionaryAiConfigurationTable.activeRevisionId,
                ),
            )
            .where(eq(dictionaryAiConfigurationTable.id, 'global'))
            .limit(1),
        persistence.database
            .select()
            .from(dictionaryAiWorkerObservationsTable)
            .orderBy(desc(dictionaryAiWorkerObservationsTable.checkedAt)),
    ]);

    return aiSettingsResponse(
        persistence,
        row
            ? {
                  snapshot: row.snapshot,
                  updatedAt: row.updatedAt,
                  version: row.version,
              }
            : null,
        observations,
    );
}

export async function updateAiSettings(
    persistence: AdministrationStoreContext,
    input: AdminAiSettingsMutationInput,
): Promise<AdminAiSettingsResponse> {
    const enabledModels = [...new Set(input.enabledModels)];
    if (enabledModels.length !== input.enabledModels.length) {
        throw new AdminAiSettingsUnavailableError(
            'Enabled AI models must be unique.',
        );
    }

    const catalogById = new Map(
        dictionaryAiModelCatalog.map((model) => [model.id, model]),
    );

    if (enabledModels.some((modelId) => !catalogById.has(modelId))) {
        throw new AdminAiSettingsUnavailableError(
            'One or more selected AI models are unsupported.',
        );
    }

    const selected = findDictionaryAiModel(
        input.activeProvider,
        input.defaultModel,
    );

    if (!selected || !enabledModels.includes(selected.id)) {
        throw new AdminAiSettingsUnavailableError(
            'The default model must be enabled for the active provider.',
        );
    }

    if (
        dictionaryAiTextFormats.some(
            (format) => !selected.supportedFormats.includes(format),
        )
    ) {
        throw new AdminAiSettingsUnavailableError(
            'The default model does not support every dictionary text-generation format.',
        );
    }

    if (!isDictionaryAiCredentialConfigured(selected.providerId)) {
        throw new AdminAiSettingsUnavailableError(
            `The ${selected.providerId} credential is not configured.`,
        );
    }

    if (process.env.DICTIONARY_AI_MANAGED_ROUTING_ENABLED !== 'true') {
        throw new AdminAiSettingsUnavailableError(
            'Managed AI routing has not been activated for this deployment.',
        );
    }

    const observations = await persistence.database
        .select()
        .from(dictionaryAiWorkerObservationsTable)
        .where(
            and(
                eq(
                    dictionaryAiWorkerObservationsTable.providerId,
                    selected.providerId,
                ),
                eq(dictionaryAiWorkerObservationsTable.modelId, selected.id),
            ),
        )
        .orderBy(desc(dictionaryAiWorkerObservationsTable.checkedAt));

    if (
        observations.some(
            (observation) =>
                observation.adapterRevision === selected.adapterRevision &&
                observation.expiresAt.getTime() > Date.now() &&
                observation.status === 'unavailable',
        )
    ) {
        throw new AdminAiSettingsUnavailableError(
            'The selected AI provider is unavailable according to the latest worker observation.',
        );
    }

    await persistence.database.transaction(async (transaction) => {
        await transaction.execute(
            sql`select pg_advisory_xact_lock(${activeOwnerMutationLock})`,
        );

        const [clock] = await transaction
            .select({ value: sql<string>`clock_timestamp()::text` })
            .from(usersTable)
            .limit(1);
        const operationTime = new Date(clock?.value ?? Number.NaN);
        if (Number.isNaN(operationTime.getTime())) {
            throw new AdminAccessDeniedError();
        }

        await assertActorCanMutate(
            persistence,
            transaction,
            input,
            operationTime,
        );

        const [current] = await transaction
            .select({ version: dictionaryAiConfigurationTable.version })
            .from(dictionaryAiConfigurationTable)
            .where(eq(dictionaryAiConfigurationTable.id, 'global'))
            .limit(1)
            .for('update');
        const currentVersion = current?.version ?? 0;
        if (currentVersion !== input.expectedVersion) {
            throw new AdminAiSettingsConflictError();
        }

        const nextVersion = currentVersion + 1;
        await transaction
            .insert(dictionaryAiConfigurationRevisionsTable)
            .values({
                catalogSnapshot: {
                    adapterRevision: selected.adapterRevision,
                    aggregateBudget: selected.aggregateBudget,
                    credentialReference: selected.credentialReference,
                    creditPricing: selected.creditPricing,
                    enabledModelIds: enabledModels,
                    modelId: selected.id,
                    perCallMaxInputTokens: selected.perCallMaxInputTokens,
                    perCallMaxOutputTokens: selected.perCallMaxOutputTokens,
                    providerId: selected.providerId,
                    supportedFormats: [...selected.supportedFormats],
                },
                createdAt: operationTime,
                createdByUserId: input.actorUserId,
                id: input.revisionId,
                version: nextVersion,
            });

        if (current) {
            await transaction
                .update(dictionaryAiConfigurationTable)
                .set({
                    activeRevisionId: input.revisionId,
                    updatedAt: operationTime,
                    version: nextVersion,
                })
                .where(
                    and(
                        eq(dictionaryAiConfigurationTable.id, 'global'),
                        eq(
                            dictionaryAiConfigurationTable.version,
                            currentVersion,
                        ),
                    ),
                );
        } else {
            await transaction.insert(dictionaryAiConfigurationTable).values({
                activeRevisionId: input.revisionId,
                id: 'global',
                updatedAt: operationTime,
                version: nextVersion,
            });
        }

        await transaction.insert(adminAuditEventsTable).values(
            auditValues({
                action: 'ai_settings_updated',
                actorUserId: input.actorUserId,
                afterVersion: nextVersion,
                ...(currentVersion > 0
                    ? { beforeVersion: currentVersion }
                    : {}),
                ...input.audit,
                expiresAt: new Date(
                    operationTime.getTime() +
                        (input.audit.expiresAt.getTime() -
                            input.audit.occurredAt.getTime()),
                ),
                metadata: {
                    activeProvider: selected.providerId,
                    defaultModel: selected.id,
                    enabledModels,
                    targetId: 'global',
                    targetKind: 'dictionary_ai_configuration',
                },
                occurredAt: operationTime,
                outcome: 'success',
                reason: input.reason,
            }),
        );
    });

    return aiSettings(persistence);
}

export function aiSettingsResponse(
    persistence: AdministrationStoreContext,
    row: {
        snapshot:
            | (typeof dictionaryAiConfigurationRevisionsTable.$inferSelect)['catalogSnapshot']
            | null;
        updatedAt: Date;
        version: number;
    } | null,
    observations: Array<
        typeof dictionaryAiWorkerObservationsTable.$inferSelect
    >,
): AdminAiSettingsResponse {
    const routingEnabled =
        process.env.DICTIONARY_AI_MANAGED_ROUTING_ENABLED === 'true';

    return {
        providers: (['deepseek', 'kie'] as const).map((providerId) => {
            const models = dictionaryAiModelCatalog.filter(
                (model) => model.providerId === providerId,
            );
            const configured = isDictionaryAiCredentialConfigured(providerId);
            const observedModelId =
                row?.snapshot?.providerId === providerId
                    ? row.snapshot.modelId
                    : models[0]?.id;
            const modelObservations = observations.filter(
                (candidate) =>
                    candidate.providerId === providerId &&
                    candidate.modelId === observedModelId,
            );
            const currentObservations = modelObservations.filter(
                (observation) => observation.expiresAt.getTime() > Date.now(),
            );
            const currentObservation =
                currentObservations.find(
                    (observation) => observation.status === 'unavailable',
                ) ??
                currentObservations.find(
                    (observation) => observation.status === 'available',
                ) ??
                currentObservations[0];
            const latestObservation = modelObservations[0];
            const health = !configured
                ? {
                      checkedAt:
                          latestObservation?.checkedAt.toISOString() ?? null,
                      message: 'Provider credential is missing.',
                      status: 'unverified' as const,
                  }
                : currentObservation
                  ? {
                        checkedAt: currentObservation.checkedAt.toISOString(),
                        message: currentObservation.message,
                        status: currentObservation.status as
                            'available' | 'unavailable' | 'unverified',
                    }
                  : {
                        checkedAt:
                            latestObservation?.checkedAt.toISOString() ?? null,
                        message: latestObservation
                            ? 'The latest worker readiness observation is stale.'
                            : 'Credential configured; worker readiness has not been observed.',
                        status: 'unverified' as const,
                    };

            return {
                credentialStatus: configured ? 'configured' : 'missing',
                health,
                id: providerId,
                label: providerId === 'deepseek' ? 'DeepSeek' : 'Kie',
                models: models.map((model) => ({
                    available:
                        configured &&
                        routingEnabled &&
                        health.status !== 'unavailable',
                    creditPricing: model.creditPricing,
                    id: model.id,
                    label: model.label,
                    supportedFormats: [...model.supportedFormats],
                    unavailableReason: !routingEnabled
                        ? 'Managed AI routing is not active for this deployment.'
                        : configured && health.status === 'unavailable'
                          ? health.message
                          : configured
                            ? null
                            : 'Provider credential is missing.',
                })),
            };
        }),
        settings: {
            activeProvider: row?.snapshot?.providerId ?? null,
            defaultModel: row?.snapshot?.modelId ?? null,
            enabledModels: row?.snapshot?.enabledModelIds ?? [],
            updatedAt: row?.updatedAt.toISOString() ?? null,
            version: row?.version ?? 0,
        },
    };
}
