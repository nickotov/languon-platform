import { randomUUID } from 'node:crypto';
import { and, desc, eq, gt, isNull, lte, sql } from 'drizzle-orm';
import {
    KnowledgeTranscriptionAdminConfigSchema,
    KnowledgeTranscriptionAdminRevisionSchema,
    KnowledgeTranscriptionAdminStateSchema,
    ProviderPriceSchema,
    type KnowledgeTranscriptionAdminPreviewRequest,
} from '@languon/contracts';
import {
    AdminAccessDeniedError,
    AdminAiSettingsConflictError,
    AdminAiSettingsUnavailableError,
} from '../../../../administration/application/administration-errors';
import { RecentAuthenticationRequiredError } from '../../../../authentication/application/authentication-errors';
import {
    usersTable,
    userEmailsTable,
} from '../../../../users/infrastructure/persistence/drizzle/schema';
import { authSessionsTable } from '../../../../authentication/infrastructure/persistence/drizzle/schema';
import {
    adminMembershipsTable,
    adminAuditEventsTable,
} from '../../../../administration/infrastructure/persistence/drizzle/schema';
import { activeOwnerMutationLock } from '../../../../administration/infrastructure/persistence/drizzle/owner-lock';
import { aiProviderPriceRevisionsTable as prices } from '../../../../ai-credits/infrastructure/persistence/drizzle/provider-price-schema';
import type {
    TranscriptionAdminActor,
    TranscriptionAdminStore,
} from '../../../application/transcription-admin-store';
import {
    transcriptionAdminReadiness,
    type TranscriptionReadinessOptions,
} from '../../transcription-admin-readiness';
import {
    knowledgeTranscriptionConfigRevisionsTable as revisions,
    knowledgeTranscriptionStateTable as state,
} from './transcription-accounting-schema';
import type {
    KnowledgeDatabase,
    KnowledgeTransaction,
} from './knowledge-transaction';

type ConfigRow = typeof revisions.$inferSelect;
function config(row: ConfigRow) {
    return KnowledgeTranscriptionAdminConfigSchema.parse({
        enabled: row.enabled,
        processingControlsRevision: row.processingControlsRevision,
        providerPriceRevisionId: row.providerPriceRevisionId,
        creditsPerMinute: row.creditsPerMinute,
        maximumDurationMs: row.maximumDurationMs,
        maximumBytes: row.maximumBytes,
        maximumProviderCostMicros: row.maximumProviderCostMicros,
        billingRulesVerified: row.billingRulesVerified,
        billingEvidence: row.billingEvidence,
        dataSharingDisabled: row.dataSharingDisabled,
        dataSharingEvidence: row.dataSharingEvidence,
    });
}

function revision(row: ConfigRow) {
    return KnowledgeTranscriptionAdminRevisionSchema.parse({
        ...config(row),
        id: row.id,
        version: row.version,
        createdBy: row.createdBy,
        reason: row.reason,
        dataSharingAttestedAt: row.dataSharingAttestedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
    });
}

async function current(tx: KnowledgeTransaction) {
    const [row] = await tx
        .select({ revision: revisions })
        .from(state)
        .innerJoin(revisions, eq(state.activeRevisionId, revisions.id))
        .where(eq(state.id, 'global'));

    return row?.revision ?? null;
}

async function providerPrices(tx: KnowledgeTransaction) {
    const rows = await tx
        .select()
        .from(prices)
        .where(
            and(
                eq(prices.providerId, 'openai'),
                eq(prices.modelId, 'gpt-transcribe'),
                eq(prices.meter, 'audio-duration'),
                lte(prices.effectiveAt, new Date()),
            ),
        )
        .orderBy(desc(prices.version))
        .limit(500);

    return rows.map((row) =>
        ProviderPriceSchema.parse({
            ...row.data,
            id: row.id,
            version: row.version,
            createdBy: row.createdBy,
            createdAt: row.createdAt.toISOString(),
            effectiveAt: row.effectiveAt.toISOString(),
        }),
    );
}

async function assertActor(
    tx: KnowledgeTransaction,
    actor: TranscriptionAdminActor,
    now: Date,
) {
    const [user] = await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(
            and(
                eq(usersTable.id, actor.userId),
                eq(usersTable.status, 'active'),
            ),
        )
        .for('update');

    if (!user) throw new AdminAccessDeniedError();
    const [principal] = await tx
        .select({ authenticatedAt: authSessionsTable.authenticatedAt })
        .from(authSessionsTable)
        .innerJoin(
            adminMembershipsTable,
            and(
                eq(adminMembershipsTable.userId, authSessionsTable.userId),
                eq(adminMembershipsTable.role, 'owner'),
                isNull(adminMembershipsTable.revokedAt),
            ),
        )
        .innerJoin(
            userEmailsTable,
            and(
                eq(userEmailsTable.userId, authSessionsTable.userId),
                eq(userEmailsTable.isPrimary, true),
                sql`${userEmailsTable.verifiedAt} is not null`,
            ),
        )
        .where(
            and(
                eq(authSessionsTable.id, actor.sessionId),
                eq(authSessionsTable.userId, actor.userId),
                isNull(authSessionsTable.revokedAt),
                isNull(authSessionsTable.rotatedAt),
                gt(authSessionsTable.absoluteExpiresAt, now),
            ),
        )
        .for('update', { of: authSessionsTable });

    if (!principal) throw new AdminAccessDeniedError();
    if (principal.authenticatedAt.getTime() + 300_000 <= now.getTime())
        throw new RecentAuthenticationRequiredError();
}

export class DrizzleTranscriptionAdminStore implements TranscriptionAdminStore {
    constructor(
        private readonly database: KnowledgeDatabase,
        private readonly readiness:
            | TranscriptionReadinessOptions
            | (() => Promise<TranscriptionReadinessOptions>),
    ) {}

    private async readinessOptions() {
        return typeof this.readiness === 'function'
            ? this.readiness()
            : this.readiness;
    }

    read() {
        return this.database.transaction(async (tx) => {
            const row = await current(tx);
            const available = await providerPrices(tx);

            return KnowledgeTranscriptionAdminStateSchema.parse({
                version: row?.version ?? 0,
                current: row ? revision(row) : null,
                readiness: transcriptionAdminReadiness(
                    row ? config(row) : null,
                    available,
                    {
                        ...(await this.readinessOptions()),
                        attestedCredentialFingerprint:
                            row?.processingCredentialFingerprint,
                        dataSharingAttestedAt: row?.dataSharingAttestedAt,
                    },
                ),
                prices: available,
                providerId: 'openai',
                modelId: 'gpt-transcribe',
            });
        });
    }

    preview(input: KnowledgeTranscriptionAdminPreviewRequest) {
        return this.database.transaction(async (tx) => {
            const row = await current(tx);
            if ((row?.version ?? 0) !== input.expectedVersion)
                throw new AdminAiSettingsConflictError();

            return transcriptionAdminReadiness(
                input.config,
                await providerPrices(tx),
                { ...(await this.readinessOptions()), preview: true },
            );
        });
    }

    async apply(
        actor: TranscriptionAdminActor,
        input: KnowledgeTranscriptionAdminPreviewRequest,
        expiresAt: Date,
    ) {
        await this.database.transaction(async (tx) => {
            await tx.execute(
                sql`select pg_advisory_xact_lock(${activeOwnerMutationLock})`,
            );

            const now = new Date();
            await assertActor(tx, actor, now);
            const [existing] = await tx
                .select()
                .from(revisions)
                .where(eq(revisions.id, input.revisionId));

            if (existing) {
                if (
                    existing.createdBy !== actor.userId ||
                    existing.version !== input.expectedVersion + 1 ||
                    existing.reason !== input.reason ||
                    JSON.stringify(config(existing)) !==
                        JSON.stringify(
                            KnowledgeTranscriptionAdminConfigSchema.parse(
                                input.config,
                            ),
                        )
                )
                    throw new AdminAiSettingsConflictError();

                return;
            }

            const row = await current(tx);
            if (
                (row?.version ?? 0) !== input.expectedVersion ||
                expiresAt.getTime() <= now.getTime()
            )
                throw new AdminAiSettingsConflictError();
            const options = await this.readinessOptions();
            const readiness = transcriptionAdminReadiness(
                input.config,
                await providerPrices(tx),
                { ...options, preview: true },
            );

            if (
                input.config.dataSharingDisabled &&
                (!options.credentialFingerprint ||
                    !input.config.dataSharingEvidence)
            )
                throw new AdminAiSettingsUnavailableError(
                    'Organization data-sharing attestation requires current credentials and evidence.',
                );
            if (input.config.enabled && !readiness.ready)
                throw new AdminAiSettingsUnavailableError(
                    'Transcription is not ready. Review processing approval, credentials, pricing, billing evidence and execution bounds.',
                );
            await tx.insert(revisions).values({
                id: input.revisionId,
                version: input.expectedVersion + 1,
                ...input.config,
                processingCredentialFingerprint: input.config
                    .dataSharingDisabled
                    ? (options.credentialFingerprint ?? null)
                    : null,
                dataSharingAttestedAt: input.config.dataSharingDisabled
                    ? now
                    : null,
                createdBy: actor.userId,
                createdAt: now,
                reason: input.reason,
            });

            await tx
                .insert(state)
                .values({ id: 'global', activeRevisionId: input.revisionId })
                .onConflictDoUpdate({
                    target: state.id,
                    set: { activeRevisionId: input.revisionId },
                });

            await tx.insert(adminAuditEventsTable).values({
                id: randomUUID(),
                actorUserId: actor.userId,
                action: 'ai_settings_updated',
                outcome: 'success',
                beforeVersion: input.expectedVersion,
                afterVersion: input.expectedVersion + 1,
                reason: input.reason,
                correlationId: actor.correlationId,
                occurredAt: now,
                expiresAt: new Date(now.getTime() + 365 * 24 * 60 * 60_000),
                metadata: {
                    capability: 'knowledge-transcription',
                    revisionId: input.revisionId,
                    enabled: input.config.enabled,
                    processingControlsRevision:
                        input.config.processingControlsRevision,
                    dataSharingDisabled: input.config.dataSharingDisabled,
                    dataSharingAttestedAt: input.config.dataSharingDisabled
                        ? now.toISOString()
                        : null,
                },
            });
        });

        return this.read();
    }
}
