import { randomUUID } from 'node:crypto';
import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    KNOWLEDGE_TRANSCRIPTION_PROCESSING_REVISION,
    type KnowledgeTranscriptionAdminPreviewRequest,
} from '@languon/contracts';
import { databaseSchema } from '../../../../../infrastructure/database/schema';
import {
    usersTable,
    userEmailsTable,
} from '../../../../users/infrastructure/persistence/drizzle/schema';
import { authSessionsTable } from '../../../../authentication/infrastructure/persistence/drizzle/schema';
import {
    adminMembershipsTable,
    adminAuditEventsTable,
} from '../../../../administration/infrastructure/persistence/drizzle/schema';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../../../../../tests/integration/support/test-database';
import { knowledgeTranscriptionConfigRevisionsTable as revisions } from './transcription-accounting-schema';
import { DrizzleTranscriptionAdminStore } from './transcription-admin-store';
import type { KnowledgeDatabase } from './knowledge-transaction';

describe.runIf(isDatabaseIntegrationEnabled())(
    'Transcription admin immutable publication PostgreSQL boundary',
    () => {
        let client: PostgresClient;
        let db: KnowledgeDatabase;
        let store: DrizzleTranscriptionAdminStore;
        const actor = {
            userId: randomUUID(),
            sessionId: randomUUID(),
            correlationId: randomUUID(),
        };
        const membershipId = randomUUID();
        let authenticatedAt: Date;
        beforeAll(async () => {
            client = createTestPostgresClient();
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            db = createDrizzleDatabase(client, databaseSchema);
            store = new DrizzleTranscriptionAdminStore(db, {
                credentialsConfigured: false,
                executionReady: false,
            });
            const now = new Date();
            authenticatedAt = now;
            await db
                .insert(usersTable)
                .values({ id: actor.userId, status: 'active' });
            await db.insert(userEmailsTable).values({
                id: randomUUID(),
                userId: actor.userId,
                email: 'transcription-owner@example.test',
                canonicalEmail: 'transcription-owner@example.test',
                isPrimary: true,
                verifiedAt: now,
            });
            await db.insert(adminMembershipsTable).values({
                id: membershipId,
                userId: actor.userId,
                grantedByUserId: actor.userId,
                grantReason: 'Synthetic configuration owner',
                role: 'owner',
            });
            await db.insert(authSessionsTable).values({
                id: actor.sessionId,
                userId: actor.userId,
                familyId: randomUUID(),
                authenticationMethod: 'password',
                authenticatedAt: now,
                absoluteExpiresAt: new Date(now.getTime() + 3600_000),
                refreshTokenDigest: 'B'.repeat(43),
            });
        }, 120_000);
        afterAll(async () => client?.end(), 120_000);
        async function input(): Promise<KnowledgeTranscriptionAdminPreviewRequest> {
            return {
                revisionId: randomUUID(),
                expectedVersion: (await store.read()).version,
                reason: 'Review disabled transcription configuration',
                config: {
                    enabled: false,
                    providerPriceRevisionId: null,
                    creditsPerMinute: null,
                    maximumDurationMs: 60_000,
                    maximumBytes: 5_242_880,
                    maximumProviderCostMicros: 10_000,
                    processingControlsRevision: null,
                    dataSharingDisabled: false,
                    dataSharingEvidence: null,
                    billingRulesVerified: false,
                    billingEvidence: null,
                },
            };
        }
        const future = () => new Date(Date.now() + 300_000);
        it('starts unconfigured without a fabricated rate and atomically publishes one immutable audited revision', async () => {
            expect(await store.read()).toMatchObject({
                version: 0,
                current: null,
            });
            const candidate = await input();
            const result = await store.apply(actor, candidate, future());
            expect(result).toMatchObject({
                version: 1,
                current: {
                    id: candidate.revisionId,
                    creditsPerMinute: null,
                    enabled: false,
                },
            });
            const audit = await db
                .select()
                .from(adminAuditEventsTable)
                .where(eq(adminAuditEventsTable.actorUserId, actor.userId));
            expect(audit).toHaveLength(1);
            expect(audit[0]!.metadata).toMatchObject({
                capability: 'knowledge-transcription',
                revisionId: candidate.revisionId,
                enabled: false,
            });
        });
        it('pins actual credential review privately and exposes only the attestation time and evidence', async () => {
            const fingerprint = 'a'.repeat(64);
            const reviewedStore = new DrizzleTranscriptionAdminStore(db, {
                credentialsConfigured: true,
                executionReady: false,
                credentialFingerprint: fingerprint,
            });
            const candidate = await input();
            candidate.config.processingControlsRevision =
                KNOWLEDGE_TRANSCRIPTION_PROCESSING_REVISION;
            candidate.config.dataSharingDisabled = true;
            candidate.config.dataSharingEvidence =
                'Synthetic actual organization/project opt-in review';
            const result = await reviewedStore.apply(
                actor,
                candidate,
                future(),
            );
            expect(result.current!.dataSharingAttestedAt).toBe(
                result.current!.createdAt,
            );
            expect(JSON.stringify(result)).not.toContain(
                'processingCredentialFingerprint',
            );
            expect(JSON.stringify(result)).not.toContain(fingerprint);
            const [stored] = await db
                .select()
                .from(revisions)
                .where(eq(revisions.id, candidate.revisionId));
            expect(stored!.processingCredentialFingerprint).toBe(fingerprint);
            const rotatedStore = new DrizzleTranscriptionAdminStore(db, {
                credentialsConfigured: true,
                executionReady: false,
                credentialFingerprint: 'b'.repeat(64),
            });
            expect((await rotatedStore.read()).readiness.reasons).toContain(
                'processing_credentials_changed',
            );
        });
        it('replays an identical published operation without creating another revision or audit', async () => {
            const candidate = await input();
            await store.apply(actor, candidate, future());
            const before = (await db.select().from(revisions)).length;
            await store.apply(actor, candidate, new Date(0));
            expect(await db.select().from(revisions)).toHaveLength(before);
            await expect(
                store.apply(
                    actor,
                    { ...candidate, reason: 'Different unreviewed reason' },
                    future(),
                ),
            ).rejects.toThrow('changed');
        });
        it('fences concurrent optimistic publications and retains the winning configuration', async () => {
            const first = await input();
            const second = {
                ...first,
                revisionId: randomUUID(),
                reason: 'Other reviewed disabled configuration',
            };
            const outcomes = await Promise.allSettled([
                store.apply(actor, first, future()),
                store.apply(actor, second, future()),
            ]);
            expect(
                outcomes.filter((item) => item.status === 'fulfilled'),
            ).toHaveLength(1);
            expect(
                outcomes.filter((item) => item.status === 'rejected'),
            ).toHaveLength(1);
            expect((await store.read()).version).toBe(
                first.expectedVersion + 1,
            );
        });
        it('rejects expired previews before creating a configuration row', async () => {
            const candidate = await input();
            await expect(
                store.apply(actor, candidate, new Date(0)),
            ).rejects.toThrow('changed');
            expect((await store.read()).version).toBe(
                candidate.expectedVersion,
            );
        });
        it('rechecks revoked owner membership in the publication transaction', async () => {
            const candidate = await input();
            await db
                .update(adminMembershipsTable)
                .set({
                    revokedAt: new Date(),
                    revokedByUserId: actor.userId,
                    revokeReason: 'Synthetic revocation race',
                    updatedAt: new Date(),
                })
                .where(eq(adminMembershipsTable.id, membershipId));
            await expect(
                store.apply(actor, candidate, future()),
            ).rejects.toThrow('Administrator access');
            await db
                .update(adminMembershipsTable)
                .set({
                    revokedAt: null,
                    revokedByUserId: null,
                    revokeReason: null,
                    updatedAt: new Date(),
                })
                .where(eq(adminMembershipsTable.id, membershipId));
            expect((await store.read()).version).toBe(
                candidate.expectedVersion,
            );
        });
        it('rechecks recent authentication before publication', async () => {
            const candidate = await input();
            await db
                .update(authSessionsTable)
                .set({ authenticatedAt: new Date(Date.now() - 360_000) })
                .where(eq(authSessionsTable.id, actor.sessionId));
            await expect(
                store.apply(actor, candidate, future()),
            ).rejects.toThrow();
            await db
                .update(authSessionsTable)
                .set({
                    authenticatedAt,
                    updatedAt: new Date(),
                })
                .where(eq(authSessionsTable.id, actor.sessionId));
            expect((await store.read()).version).toBe(
                candidate.expectedVersion,
            );
        });
        it('database authority rejects rewriting an immutable published configuration', async () => {
            const snapshot = await store.read();
            expect(snapshot.current).not.toBeNull();
            await expect(
                db
                    .update(revisions)
                    .set({ maximumBytes: 1 })
                    .where(eq(revisions.id, snapshot.current!.id)),
            ).rejects.toThrow();
            expect((await store.read()).current!.maximumBytes).toBe(
                snapshot.current!.maximumBytes,
            );
        });
    },
);
