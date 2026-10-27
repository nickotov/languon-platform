import { randomUUID } from 'node:crypto';
import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
import { eq } from 'drizzle-orm';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { adminMcpIssueTokenSchema } from '@languon/contracts';
import { databaseSchema } from '../../../../../infrastructure/database/schema';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../../../../../tests/integration/support/test-database';
import {
    usersTable,
    userEmailsTable,
} from '../../../../users/infrastructure/persistence/drizzle/schema';
import { adminMembershipsTable } from '../../../../administration/infrastructure/persistence/drizzle/schema';
import { AdminMcpCredentialService } from '../../../application/admin-mcp-credential-service';
import { AdminMcpError } from '../../../domain/admin-mcp';
import { DrizzleAdminMcpStore } from './drizzle-admin-mcp-store';
import { AdminMcpQuotaStore } from './admin-mcp-quota-store';
import { AdminMcpPreviewStore } from './admin-mcp-preview-store';
import {
    adminMcpReceiptsTable,
    adminMcpPreviewsTable,
    adminMcpReservationsTable,
    adminMcpTokensTable,
} from './schema';
import { purgeAdminMcpForOwner } from './admin-mcp-deletion-participant';
import type { AdminMcpDatabase } from './admin-mcp-persistence';

import {
    createAdminMcpServer,
    type AdminMcpServerDependencies,
} from '../../../interface/http/admin-mcp-server';
import { AdminMcpOperations } from '../../operations/admin-mcp-operations';
import { AdminMcpAdministrationService } from '../../../application/admin-mcp-administration-service';
import { AdminMcpAdministrationAdapter } from '../../admin-mcp-administration-adapter';
import { DrizzleProviderPriceStore } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-provider-prices';
import { DrizzleAccountingStore } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-accounting-store';
import { DrizzleAiCreditTransactionParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { DrizzleTextAiRoutingStore } from '../../../../text-ai/infrastructure/persistence/drizzle/drizzle-text-ai-routing-store';

const operationKeys = new Map<string, string>();
function operationKey(label: string): string {
    const existing = operationKeys.get(label);
    if (existing) return existing;
    const id = randomUUID();
    operationKeys.set(label, id);
    return id;
}

describe.runIf(isDatabaseIntegrationEnabled())(
    'MCP persisted delegation invariants',
    () => {
        let client: PostgresClient;
        let db: AdminMcpDatabase;
        const initial = new Date('2026-10-27T12:00:00Z');
        beforeAll(async () => {
            client = createTestPostgresClient();
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            db = createDrizzleDatabase(client, databaseSchema);
        }, 120_000);
        afterAll(async () => {
            await client?.end();
        });
        async function fixture() {
            const owner = randomUUID();
            await db.insert(usersTable).values({ id: owner, status: 'active' });
            const email = `mcp-${owner}@example.test`;
            await db.insert(userEmailsTable).values({
                id: randomUUID(),
                userId: owner,
                email,
                canonicalEmail: email,
                verifiedAt: initial,
            });
            await db.insert(adminMembershipsTable).values({
                id: randomUUID(),
                userId: owner,
                grantedByUserId: owner,
                grantReason: 'Synthetic owner',
                grantedAt: initial,
                updatedAt: initial,
            });
            let time = initial;
            const now = () => time;
            const service = new AdminMcpCredentialService(
                new DrizzleAdminMcpStore(db),
                now,
            );
            const issued = await service.issue(
                owner,
                adminMcpIssueTokenSchema.parse({
                    name: 'Synthetic client',
                    reason: 'Test boundaries',
                    permissions: [
                        'users.read',
                        'routing.write',
                        'model-checks.run',
                    ],
                    limits: {
                        modelChecks: {
                            perCheckUsd: '0.05',
                            perDayUsd: '0.1',
                            concurrency: 1,
                        },
                    },
                }),
            );
            const actor = await service.authenticate(issued.secret);
            return {
                owner,
                service,
                issued,
                actor,
                now,
                advance: (ms: number) => {
                    time = new Date(time.getTime() + ms);
                },
            };
        }
        it('invalidates revoked, disabled-owner and removed-membership tokens on the next request', async () => {
            for (const kind of ['revoked', 'disabled', 'membership']) {
                const f = await fixture();
                if (kind === 'revoked')
                    await f.service.revoke(
                        f.owner,
                        f.actor.tokenId,
                        'Contain leaked credential',
                    );
                if (kind === 'disabled')
                    await db
                        .update(usersTable)
                        .set({ status: 'disabled' })
                        .where(eq(usersTable.id, f.owner));
                if (kind === 'membership')
                    await db
                        .update(adminMembershipsTable)
                        .set({
                            revokedAt: initial,
                            revokedByUserId: f.owner,
                            revokeReason: 'Remove access',
                        })
                        .where(eq(adminMembershipsTable.userId, f.owner));
                await expect(
                    f.service.authenticate(f.issued.secret),
                ).rejects.toMatchObject({ code: 'unauthorized' });
            }
        });
        it('atomically rejects concurrent checks, preserves uncertain expense, and replays without dispatch', async () => {
            const f = await fixture();
            const quota = new AdminMcpQuotaStore(db, f.now);
            const results = await Promise.allSettled([
                quota.reserve(
                    f.actor,
                    operationKey('one'),
                    { model: 'test' },
                    'model-check',
                    '0.05',
                ),
                quota.reserve(
                    f.actor,
                    operationKey('two'),
                    { model: 'test' },
                    'model-check',
                    '0.05',
                ),
            ]);
            expect(
                results.filter((result) => result.status === 'fulfilled'),
            ).toHaveLength(1);
            const success = results.find(
                (result) => result.status === 'fulfilled',
            );
            if (success?.status !== 'fulfilled')
                throw new Error('Expected one reservation');
            const key =
                results[0]?.status === 'fulfilled'
                    ? operationKey('one')
                    : operationKey('two');
            await expect(
                quota.reserve(
                    f.actor,
                    key,
                    { model: 'test' },
                    'model-check',
                    '0.05',
                ),
            ).resolves.toMatchObject({ id: success.value.id, replay: true });
            await quota.settle(success.value.id, null);
            await expect(
                quota.reserve(
                    f.actor,
                    operationKey('third'),
                    {},
                    'model-check',
                    '0.01',
                ),
            ).rejects.toMatchObject({ code: 'quota_exceeded' });
            await quota.settle(success.value.id, '0.02');
            await expect(
                quota.reserve(
                    f.actor,
                    operationKey('fourth'),
                    {},
                    'model-check',
                    '0.05',
                ),
            ).resolves.toMatchObject({ replay: false });
        });
        it('commits one exact preview, replays after expiry, rejects changed keys and stale previews', async () => {
            const f = await fixture();
            const previews = new AdminMcpPreviewStore(db, f.now);
            const input = {
                operation: 'routing.write' as const,
                target: 'routing',
                current: { version: 1 },
                proposed: { version: 2 },
                expectedVersion: '1',
                reason: 'Synthetic change',
            };
            const preview = await previews.create(f.actor, input);
            let calls = 0;
            const apply = async () => {
                calls++;
                return { version: 2 };
            };
            await expect(
                previews.executePreview(
                    f.actor,
                    preview.id,
                    operationKey('apply-one'),
                    apply,
                ),
            ).resolves.toEqual({ version: 2 });
            f.advance(301_000);
            await expect(
                previews.executePreview(
                    f.actor,
                    preview.id,
                    operationKey('apply-one'),
                    apply,
                ),
            ).resolves.toEqual({ version: 2 });
            expect(calls).toBe(1);
            await expect(
                previews.executePreview(
                    f.actor,
                    preview.id,
                    operationKey('apply-two'),
                    apply,
                ),
            ).rejects.toMatchObject({ code: 'idempotency_conflict' });
            const other = await previews.create(f.actor, input);
            await expect(
                previews.executePreview(
                    f.actor,
                    other.id,
                    operationKey('apply-one'),
                    apply,
                ),
            ).rejects.toMatchObject({ code: 'idempotency_conflict' });
            f.advance(301_000);
            await expect(
                previews.executePreview(
                    f.actor,
                    other.id,
                    operationKey('fresh-key'),
                    apply,
                ),
            ).rejects.toMatchObject({ code: 'preview_expired' });
            const stale = await previews.create(f.actor, input);
            await expect(
                previews.executePreview(
                    f.actor,
                    stale.id,
                    operationKey('stale'),
                    async () => {
                        throw new AdminMcpError(
                            'stale_preview',
                            'Version changed',
                        );
                    },
                ),
            ).rejects.toMatchObject({ code: 'stale_preview' });
            const receipts = await db
                .select()
                .from(adminMcpReceiptsTable)
                .where(eq(adminMcpReceiptsTable.tokenId, f.actor.tokenId));
            expect(receipts).toHaveLength(1);
        });

        it('exposes only the authenticated owner audit and persists check status without redispatch', async () => {
            const f = await fixture();
            const other = await fixture();
            const quota = new AdminMcpQuotaStore(db, f.now);
            const reservation = await quota.reserve(
                f.actor,
                operationKey('durable-check'),
                { model: 'test' },
                'model-check',
                '0.05',
            );
            await quota.settle(reservation.id, '0.01', {
                status: 'passed',
                providerExpenseId: randomUUID(),
            });
            await expect(
                quota.get(f.actor, operationKey('durable-check')),
            ).resolves.toMatchObject({
                id: reservation.id,
                state: 'settled',
                amount: '0.010000',
                result: { status: 'passed' },
            });
            await expect(
                quota.get(other.actor, operationKey('durable-check')),
            ).resolves.toBeNull();
            await quota.recordOutcome(
                f.actor,
                'model-checks.run',
                'synthetic-model',
                'Explicit synthetic check',
                { reservationId: reservation.id },
                'success',
            );
            const ownAudit = await f.service.audit(f.owner, {
                page: 1,
                pageSize: 25,
            });
            expect(
                ownAudit.events.every((event) => event.actorUserId === f.owner),
            ).toBe(true);
            expect(
                ownAudit.events.some(
                    (event) => event.action === 'model-checks.run',
                ),
            ).toBe(true);
            expect(JSON.stringify(ownAudit)).not.toContain(f.issued.secret);
        });
        it('uses exact daily amounts and resets daily ceilings at UTC midnight', async () => {
            const f = await fixture();
            const quota = new AdminMcpQuotaStore(db, f.now);
            for (const key of [operationKey('first'), operationKey('second')]) {
                const reserved = await quota.reserve(
                    f.actor,
                    key,
                    {},
                    'model-check',
                    '0.05',
                );
                await quota.settle(reserved.id, '0.05');
            }
            await expect(
                quota.reserve(
                    f.actor,
                    operationKey('exhausted'),
                    {},
                    'model-check',
                    '0.000001',
                ),
            ).rejects.toMatchObject({ code: 'quota_exceeded' });
            f.advance(12 * 60 * 60 * 1000);
            await expect(
                quota.reserve(
                    f.actor,
                    operationKey('next-day'),
                    {},
                    'model-check',
                    '0.05',
                ),
            ).resolves.toMatchObject({ replay: false });
        });

        it('records successful preview disclosure without persisting raw configuration in its audit', async () => {
            const f = await fixture();
            const previews = new AdminMcpPreviewStore(db, f.now);
            const preview = await previews.create(f.actor, {
                operation: 'routing.write',
                target: 'routing-config',
                current: { note: 'Old private configuration' },
                proposed: { note: 'New private configuration' },
                expectedVersion: '7',
                reason: 'Review the synthetic routing change',
            });
            const response = await f.service.audit(f.owner, {
                page: 1,
                pageSize: 100,
            });
            const event = response.events.find(
                (item) => item.action === 'preview.routing.write',
            );
            expect(event).toMatchObject({
                actorUserId: f.owner,
                tokenId: f.actor.tokenId,
                target: 'routing-config',
                reason: 'Review the synthetic routing change',
                outcome: 'success',
                metadata: { previewId: preview.id, expectedVersion: '7' },
            });
            expect(event?.correlationId).toMatch(/^[0-9a-f-]{36}$/i);
            expect(JSON.stringify(event)).not.toContain(
                'private configuration',
            );
        });
        it('audits real SDK HTTP user lookup with stable identity and no raw email or credential', async () => {
            const f = await fixture();
            const operations = new AdminMcpOperations(db, {
                routing: new DrizzleTextAiRoutingStore(db, async () => {
                    throw new Error('Unused readiness dependency');
                }),
                providerPrices: new DrizzleProviderPriceStore(db),
                accounting: new DrizzleAccountingStore(
                    db,
                    (tx) => new DrizzleAiCreditTransactionParticipant(tx),
                ),
            });
            const app = createAdminMcpServer({
                credentials: f.service,
                administration: new AdminMcpAdministrationService(
                    new AdminMcpAdministrationAdapter(db, operations),
                ),
                checks: {} as AdminMcpServerDependencies['checks'],
                port: 3002,
            });
            const email = `mcp-${f.owner}@example.test`;
            const response = await app.request('http://127.0.0.1:3002/mcp', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${f.issued.secret}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/json, text/event-stream',
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'tools/call',
                    params: {
                        name: 'users_lookup',
                        arguments: {
                            email,
                            reason: 'Inspect synthetic account for the operator',
                        },
                    },
                }),
            });
            expect(response.status).toBe(200);
            const body = await response.text();
            expect(body).toContain(f.owner);
            expect(body).not.toContain('isError');
            const responseAudit = await f.service.audit(f.owner, {
                page: 1,
                pageSize: 100,
            });
            const event = responseAudit.events.find(
                (item) => item.action === 'users.lookup',
            );
            expect(event).toMatchObject({
                actorUserId: f.owner,
                tokenId: f.actor.tokenId,
                target: f.owner,
                reason: 'Inspect synthetic account for the operator',
                outcome: 'success',
            });
            expect(event?.correlationId).toMatch(/^[0-9a-f-]{36}$/i);
            expect(JSON.stringify(event)).not.toContain(email);
            expect(JSON.stringify(event)).not.toContain(f.issued.secret);
        });

        it('purges delegation content and preserves only pseudonymous financial audit references', async () => {
            const f = await fixture();
            const previews = new AdminMcpPreviewStore(db, f.now);
            const preview = await previews.create(f.actor, {
                operation: 'routing.write',
                target: 'synthetic',
                current: { privateNote: 'Sensitive old context' },
                proposed: { privateNote: 'Sensitive new context' },
                expectedVersion: '0',
                reason: 'Private owner explanation',
            });
            await previews.executePreview(
                f.actor,
                preview.id,
                randomUUID(),
                async () => ({ privateNote: 'Private receipt' }),
            );
            const quota = new AdminMcpQuotaStore(db, f.now);
            const reservation = await quota.reserve(
                f.actor,
                randomUUID(),
                {},
                'model-check',
                '0.05',
            );
            const expenseId = randomUUID();
            await quota.settle(reservation.id, '0.01', {
                privateNote: 'Private response',
            });
            await quota.recordOutcome(
                f.actor,
                'model-checks.run',
                'model',
                'Private operator reason',
                {
                    providerExpenseId: expenseId,
                    privateNote: 'Private metadata',
                },
            );
            await db.transaction((tx) =>
                purgeAdminMcpForOwner(tx, f.owner, initial),
            );
            const [token] = await db
                .select()
                .from(adminMcpTokensTable)
                .where(eq(adminMcpTokensTable.id, f.actor.tokenId));
            expect(token).toMatchObject({
                name: 'Account purged',
                permissions: [],
                allowedActions: [],
                limits: {},
            });
            expect(token?.revokedAt).not.toBeNull();
            expect(
                await db
                    .select()
                    .from(adminMcpPreviewsTable)
                    .where(eq(adminMcpPreviewsTable.tokenId, f.actor.tokenId)),
            ).toHaveLength(0);
            expect(
                await db
                    .select()
                    .from(adminMcpReceiptsTable)
                    .where(eq(adminMcpReceiptsTable.tokenId, f.actor.tokenId)),
            ).toHaveLength(0);
            expect(
                await db
                    .select()
                    .from(adminMcpReservationsTable)
                    .where(
                        eq(adminMcpReservationsTable.tokenId, f.actor.tokenId),
                    ),
            ).toHaveLength(0);
            const audit = await f.service.audit(f.owner, {
                page: 1,
                pageSize: 100,
            });
            expect(JSON.stringify(audit)).not.toContain('Private');
            expect(
                audit.events.some(
                    (event) => event.metadata.providerExpenseId === expenseId,
                ),
            ).toBe(true);
            await expect(
                f.service.authenticate(f.issued.secret),
            ).rejects.toMatchObject({ code: 'unauthorized' });
        });

        it('rejects a preview that expires while waiting on its token lock before invoking mutation', async () => {
            const f = await fixture();
            const preview = await new AdminMcpPreviewStore(db, f.now).create(
                f.actor,
                {
                    operation: 'routing.write',
                    target: 'lock-expiry',
                    current: {},
                    proposed: {},
                    expectedVersion: '0',
                    reason: 'Token lock expiry regression',
                },
            );
            let unlock!: () => void;
            let locked!: () => void;
            const lockReleased = new Promise<void>((resolve) => {
                unlock = resolve;
            });
            const lockAcquired = new Promise<void>((resolve) => {
                locked = resolve;
            });
            const holder = db.transaction(async (tx) => {
                await tx
                    .select()
                    .from(adminMcpTokensTable)
                    .where(eq(adminMcpTokensTable.id, f.actor.tokenId))
                    .for('update');
                locked();
                await lockReleased;
            });
            await lockAcquired;
            let clockCaptured!: () => void;
            const captured = new Promise<void>((resolve) => {
                clockCaptured = resolve;
            });
            const waiting = new AdminMcpPreviewStore(db, () => {
                const at = f.now();
                clockCaptured();
                return at;
            });
            let calls = 0;
            const application = waiting.executePreview(
                f.actor,
                preview.id,
                randomUUID(),
                async (tx) => {
                    calls++;
                    await tx
                        .update(usersTable)
                        .set({ version: 2 })
                        .where(eq(usersTable.id, f.owner));
                    return {};
                },
            );
            const rejected = expect(application).rejects.toMatchObject({
                code: 'preview_expired',
            });
            try {
                await captured;
                f.advance(300_001);
            } finally {
                unlock();
            }
            await holder;
            await rejected;
            expect(calls).toBe(0);
            expect(
                await db
                    .select()
                    .from(adminMcpReceiptsTable)
                    .where(eq(adminMcpReceiptsTable.tokenId, f.actor.tokenId)),
            ).toHaveLength(0);
            const [user] = await db
                .select()
                .from(usersTable)
                .where(eq(usersTable.id, f.owner));
            expect(user?.version).toBe(1);
        });
        it('rolls back the mutation and receipt if preview expiry occurs during its callback', async () => {
            const f = await fixture();
            const previews = new AdminMcpPreviewStore(db, f.now);
            const preview = await previews.create(f.actor, {
                operation: 'routing.write',
                target: 'commit-expiry',
                current: {},
                proposed: {},
                expectedVersion: '0',
                reason: 'Preview commit expiry regression',
            });
            await expect(
                previews.executePreview(
                    f.actor,
                    preview.id,
                    randomUUID(),
                    async (tx) => {
                        await tx
                            .update(usersTable)
                            .set({ version: 2 })
                            .where(eq(usersTable.id, f.owner));
                        f.advance(300_001);
                        return {};
                    },
                ),
            ).rejects.toMatchObject({ code: 'preview_expired' });
            expect(
                await db
                    .select()
                    .from(adminMcpReceiptsTable)
                    .where(eq(adminMcpReceiptsTable.tokenId, f.actor.tokenId)),
            ).toHaveLength(0);
            const [user] = await db
                .select()
                .from(usersTable)
                .where(eq(usersTable.id, f.owner));
            expect(user?.version).toBe(1);
        });

        it('rolls back mutations if token expires during the transaction callback', async () => {
            const f = await fixture();
            const previews = new AdminMcpPreviewStore(db, f.now);
            const preview = await previews.create(f.actor, {
                operation: 'routing.write',
                target: 'test',
                current: {},
                proposed: {},
                expectedVersion: '0',
                reason: 'Expiry regression',
            });
            await expect(
                previews.executePreview(
                    f.actor,
                    preview.id,
                    operationKey('expires'),
                    async (tx) => {
                        await tx
                            .update(usersTable)
                            .set({ version: 2 })
                            .where(eq(usersTable.id, f.owner));
                        f.advance(31 * 86_400_000);
                        return {};
                    },
                ),
            ).rejects.toMatchObject({ code: 'unauthorized' });
            const [user] = await db
                .select()
                .from(usersTable)
                .where(eq(usersTable.id, f.owner));
            expect(user?.version).toBe(1);
        });
    },
);
