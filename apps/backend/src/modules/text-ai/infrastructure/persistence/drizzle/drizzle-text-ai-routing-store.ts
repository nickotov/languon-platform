import { textAiRouteHealthEventsTable as healthEvents } from './route-health-schema';
import type { TextAiRoutingStore } from '../../../application/text-ai-routing-store';
import { DrizzleCapabilityPolicyParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-capability-policy-participant';
import { AdminAccessDeniedError } from '../../../../administration/application/administration-errors';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import { dictionaryAiConfigurationRevisionsTable as legacyRevisions } from './configuration-schema';
import { randomUUID } from 'node:crypto';
import { eq, sql, desc, and, isNull } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
    TextAiRoutingPublishRequestSchema,
    TextAiRoutingDisableRequestSchema,
    type TextAiRoutingDisableRequest,
    type TextAiFlowId,
    type TextAiRoutingPublishRequest,
    type TextAiRoutingRevision,
} from '@languon/contracts';
import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import { textAiModelCatalog } from '../../../application/text-ai-provider-catalog';
import {
    effectiveTextAiRouteIds,
    textAiCapabilityForFlow,
    textAiFlowForFormat,
    validateTextAiRouting,
    TextAiRoutingConflictError,
    TextAiRoutingInvalidError,
} from '../../../domain/text-ai-routing';
import {
    textAiRoutingRevisionsTable as revisions,
    textAiRoutingStateTable as state,
} from './routing-schema';
import {
    adminAuditEventsTable,
    adminMembershipsTable,
} from '../../../../administration/infrastructure/persistence/drizzle/schema';
import { TextAiFlowIdSchema } from '@languon/contracts';

type Database = PostgresJsDatabase<typeof databaseSchema>;
export type TextAiRoutingTransaction = Parameters<
    Parameters<Database['transaction']>[0]
>[0];
export type TextAiRouteReadinessCheck = (
    tx: TextAiRoutingTransaction,
    input: { routeId: string; flowId: TextAiFlowId; now: Date },
) => Promise<void>;
const dto = (row: typeof revisions.$inferSelect): TextAiRoutingRevision => ({
    id: row.id,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    configuration: row.configuration,
});

export async function currentTextAiRouting(
    tx: Pick<TextAiRoutingTransaction, 'select'>,
): Promise<TextAiRoutingRevision | null> {
    const [row] = await tx
        .select({ revision: revisions })
        .from(state)
        .innerJoin(revisions, eq(revisions.id, state.activeRevisionId))
        .where(eq(state.id, 'global'))
        .limit(1);

    return row ? dto(row.revision) : null;
}

export class DrizzleTextAiRoutingStore implements TextAiRoutingStore {
    constructor(
        private readonly database: Database,
        private readonly requireReady: TextAiRouteReadinessCheck,
        private readonly credentialConfigured: (
            providerId: string,
        ) => boolean = () => false,
    ) {}

    current() {
        return currentTextAiRouting(this.database);
    }

    async catalog() {
        return Promise.all(
            textAiModelCatalog.map(async (model) => {
                const routeId = `${model.providerId}/${model.id}`;
                const [latest] = await this.database
                    .select({
                        reason: healthEvents.reason,
                        observedAt: healthEvents.observedAt,
                    })
                    .from(healthEvents)
                    .where(eq(healthEvents.routeId, routeId))
                    .orderBy(desc(healthEvents.observedAt))
                    .limit(1);

                return {
                    routeId: `${model.providerId}/${model.id}`,
                    label: model.label,
                    providerId: model.providerId,
                    modelId: model.id,
                    configured: this.credentialConfigured(model.providerId),
                    retired: model.retired === true,
                    supportedFlows: [
                        ...new Set(
                            model.supportedFormats.map(textAiFlowForFormat),
                        ),
                    ],
                    processingEligible: model.providerId !== 'evolink',
                    runtimeHealth: latest
                        ? {
                              reason: latest.reason,
                              observedAt: latest.observedAt.toISOString(),
                          }
                        : null,
                };
            }),
        );
    }

    async disable(
        raw: TextAiRoutingDisableRequest,
        actorId: string,
        at: Date,
        correlationId = randomUUID(),
    ): Promise<TextAiRoutingRevision> {
        const input = TextAiRoutingDisableRequestSchema.parse(raw);

        return this.database.transaction(async (tx) => {
            await tx.execute(
                sql`select pg_advisory_xact_lock(hashtextextended('text-ai-routing-publication',0))`,
            );

            await assertRoutingOwner(tx, actorId);
            const current = await currentTextAiRouting(tx);
            if (!current || current.version !== input.expectedVersion)
                throw new TextAiRoutingConflictError(
                    'Routing revision changed.',
                );
            if (
                !textAiModelCatalog.some(
                    (model) =>
                        `${model.providerId}/${model.id}` === input.routeId,
                )
            )
                throw new TextAiRoutingInvalidError('Unknown route.');
            const [saved] = await tx
                .insert(revisions)
                .values({
                    id: randomUUID(),
                    version: current.version + 1,
                    configuration: {
                        ...current.configuration,
                        enabledRouteIds:
                            current.configuration.enabledRouteIds.filter(
                                (id) => id !== input.routeId,
                            ),
                    },
                    createdAt: at,
                    createdBy: actorId,
                    reason: input.reason,
                })
                .returning();

            if (!saved) throw new Error('Routing disable failed.');
            await insertLegacyBridge(tx, saved, actorId, at);
            // This revision authorizes no new model identity; admissions still
            // pin their actual executable snapshot to a legacy FK bridge.
            await tx
                .update(state)
                .set({ activeRevisionId: saved.id, updatedAt: at })
                .where(eq(state.id, 'global'));

            await tx.insert(adminAuditEventsTable).values({
                id: randomUUID(),
                actorUserId: actorId,
                action: 'ai_settings_updated',
                outcome: 'success',
                reason: input.reason,
                correlationId,
                occurredAt: at,
                expiresAt: new Date(at.getTime() + 365 * 86400_000),
                beforeVersion: current.version,
                afterVersion: saved.version,
                metadata: {
                    routingRevisionId: saved.id,
                    disabledRouteId: input.routeId,
                    operation: 'emergency_disable',
                },
            });

            return dto(saved);
        });
    }

    async publish(
        raw: TextAiRoutingPublishRequest,
        actorId: string,
        at: Date,
        correlationId = randomUUID(),
    ): Promise<TextAiRoutingRevision> {
        const input = TextAiRoutingPublishRequestSchema.parse(raw);

        return this.database.transaction(async (tx) => {
            // Only writers contend. Admission reads one compact immutable revision.
            await tx.execute(
                sql`select pg_advisory_xact_lock(hashtextextended('text-ai-routing-publication',0))`,
            );

            await assertRoutingOwner(tx, actorId);
            const current = await currentTextAiRouting(tx);
            if ((current?.version ?? 0) !== input.expectedVersion)
                throw new TextAiRoutingConflictError(
                    'Routing revision changed.',
                );
            if (
                input.configuration.enabledRouteIds.some((routeId) =>
                    routeId.startsWith('evolink/'),
                )
            )
                throw new TextAiRoutingInvalidError(
                    'EvoLink processing controls require review before activation.',
                );
            validateTextAiRouting(
                input.configuration,
                textAiModelCatalog.map((model) => ({
                    routeId: `${model.providerId}/${model.id}`,
                    formats: model.supportedFormats,
                    retired: model.retired === true,
                })),
            );

            for (const flowId of TextAiFlowIdSchema.options) {
                const tariff = input.configuration.flowTariffs[flowId];
                const policy = await new DrizzleCapabilityPolicyParticipant(
                    tx,
                ).current(textAiCapabilityForFlow(flowId));

                if (policy.funding === 'customer' && !tariff)
                    throw new TextAiRoutingInvalidError(
                        `A reviewed flow tariff is required for ${flowId}.`,
                    );
                const nextRoutes = effectiveTextAiRouteIds(
                    input.configuration,
                    flowId,
                );
                const routePolicyChanged =
                    !current ||
                    JSON.stringify(
                        effectiveTextAiRouteIds(current.configuration, flowId),
                    ) !== JSON.stringify(nextRoutes);

                for (const routeId of nextRoutes) {
                    if (
                        routePolicyChanged ||
                        !current?.configuration.enabledRouteIds.includes(
                            routeId,
                        )
                    )
                        await this.requireReady(tx, {
                            routeId,
                            flowId,
                            now: at,
                        });
                }
            }

            const [saved] = await tx
                .insert(revisions)
                .values({
                    id: randomUUID(),
                    version: input.expectedVersion + 1,
                    configuration: input.configuration,
                    createdAt: at,
                    createdBy: actorId,
                    reason: input.reason,
                })
                .returning();

            if (!saved) throw new Error('Routing publication failed.');
            await insertLegacyBridge(tx, saved, actorId, at);
            await tx
                .insert(state)
                .values({
                    id: 'global',
                    activeRevisionId: saved.id,
                    updatedAt: at,
                })
                .onConflictDoUpdate({
                    target: state.id,
                    set: { activeRevisionId: saved.id, updatedAt: at },
                });

            await tx.insert(adminAuditEventsTable).values({
                id: randomUUID(),
                actorUserId: actorId,
                action: 'ai_settings_updated',
                outcome: 'success',
                reason: input.reason,
                correlationId,
                occurredAt: at,
                expiresAt: new Date(at.getTime() + 365 * 86400_000),
                beforeVersion: current?.version ?? 0,
                afterVersion: saved.version,
                metadata: {
                    routingRevisionId: saved.id,
                    enabledRouteIds: input.configuration.enabledRouteIds,
                },
            });

            return dto(saved);
        });
    }
}

async function insertLegacyBridge(
    tx: TextAiRoutingTransaction,
    revision: typeof revisions.$inferSelect,
    actorId: string,
    at: Date,
) {
    // Existing feature tables retain their immutable configuration FK.
    // A numerical bridge preserves that identity without making legacy
    // settings authoritative for new admissions.
    const defaultRoute = textAiModelCatalog.find(
        (model) =>
            `${model.providerId}/${model.id}` ===
            revision.configuration.default.primaryRouteId,
    );

    if (!defaultRoute)
        throw new TextAiRoutingInvalidError('Default route is unavailable.');
    await tx.execute(
        sql`lock table dictionary_ai_configuration_revisions in share row exclusive mode`,
    );

    const [previousLegacy] = await tx
        .select({ version: legacyRevisions.version })
        .from(legacyRevisions)
        .orderBy(desc(legacyRevisions.version))
        .limit(1);

    await tx.insert(legacyRevisions).values({
        id: revision.id,
        version: (previousLegacy?.version ?? 0) + 1,
        createdAt: at,
        createdByUserId: actorId,
        catalogSnapshot: {
            adapterRevision: defaultRoute.adapterRevision,
            aggregateBudget: { ...defaultRoute.aggregateBudget },
            credentialReference: defaultRoute.credentialReference,
            enabledModelIds: revision.configuration.enabledRouteIds.map((id) =>
                id.slice(id.indexOf('/') + 1),
            ),
            modelId: defaultRoute.id,
            providerId: defaultRoute.providerId,
            perCallMaxInputTokens: defaultRoute.perCallMaxInputTokens,
            perCallMaxOutputTokens: defaultRoute.perCallMaxOutputTokens,
            supportedFormats: [...defaultRoute.supportedFormats],
        },
    });
}

async function assertRoutingOwner(
    tx: TextAiRoutingTransaction,
    actorId: string,
) {
    const [membership] = await tx
        .select({ role: adminMembershipsTable.role })
        .from(adminMembershipsTable)
        .innerJoin(usersTable, eq(usersTable.id, adminMembershipsTable.userId))
        .where(
            and(
                eq(adminMembershipsTable.userId, actorId),
                isNull(adminMembershipsTable.revokedAt),
                eq(usersTable.status, 'active'),
            ),
        )
        .for('share');

    if (membership?.role !== 'owner') throw new AdminAccessDeniedError();
}
