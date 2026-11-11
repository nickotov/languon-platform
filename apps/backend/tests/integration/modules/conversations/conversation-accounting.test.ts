import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { conversationAdmission } from '../../../../src/modules/conversations/infrastructure/conversation-accounting';
import {
    conversationsTable,
    conversationTurnsTable,
} from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/schema';
import { DrizzleAiCreditTransactionParticipant } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { capabilityPolicyRevisionsTable } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/capability-policy-schema';
import { dictionaryAiWorkerObservationsTable } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/configuration-schema';
import { textAiPreferencesTable } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/schema';
import { conversationExecutionObservationId } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-worker-readiness';
import { textAiModelCatalog } from '../../../../src/modules/text-ai/application/text-ai-provider-catalog';
import {
    fixtureRouteFingerprint,
    seedTextAiRoutingFixture,
} from '../../../support/text-ai-routing-fixture';
import { seedLegacyActionFixture } from '../../../support/legacy-action-fixture';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

const model = textAiModelCatalog.find((item) => item.id === 'deepseek-flash')!;
const policy = {
    routingEnabled: true,
    credentialConfigured: () => true,
    routeFingerprint: fixtureRouteFingerprint,
};

describe.runIf(isDatabaseIntegrationEnabled())(
    'current conversation admission',
    () => {
        let client: PostgresClient;
        let db: PostgresJsDatabase<typeof databaseSchema>;
        let ownerId: string;

        beforeAll(async () => {
            client = createTestPostgresClient();
            db = createDrizzleDatabase(client, databaseSchema);
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
        }, 60_000);

        afterAll(async () => client?.end());

        beforeEach(async () => {
            await client`truncate users, ai_capability_policy_revisions, ai_accounting_settings_revisions, ai_provider_price_revisions, text_ai_routing_revisions cascade`;
            ownerId = randomUUID();
            await client`insert into users(id,status) values(${ownerId},'active')`;
            await seedLegacyActionFixture(db, '10');
            await db.transaction((tx) =>
                new DrizzleAiCreditTransactionParticipant(tx).issueGrant({
                    ownerId,
                    amount: 1_000_000n,
                    createdAt: new Date(),
                    expiresAt: null,
                    source: 'admin',
                    sourceReference: randomUUID(),
                }),
            );
        });

        async function ready(funding: 'customer' | 'operator' = 'customer') {
            const now = new Date();
            await seedTextAiRoutingFixture(db);
            await db.insert(capabilityPolicyRevisionsTable).values({
                id: randomUUID(),
                capability: 'conversation',
                version: 1,
                funding,
                createdAt: now,
                reason: 'Synthetic current admission fixture',
            });

            await db
                .insert(dictionaryAiWorkerObservationsTable)
                .values({
                    id: conversationExecutionObservationId(
                        'current-admission',
                        model.providerId,
                        model.id,
                    ),
                    workerId: 'current-admission',
                    providerId: model.providerId,
                    modelId: model.id,
                    adapterRevision: model.adapterRevision,
                    checkedAt: now,
                    expiresAt: new Date(now.getTime() + 120_000),
                    status: 'available',
                    message: 'Synthetic current readiness',
                    textAiSelectionRevision: 1,
                    textAiSupportedFormats: ['conversation:v1'],
                    textAiCapacityRevision: 1,
                    textsCapacityRevision: 1,
                    conversationCapacityRevision: 1,
                    conversationExecutionRevision: 1,
                    creditSettlementRevision: 1,
                })
                .onConflictDoNothing();
        }

        const admit = (
            input: Partial<{
                inputTokenBound: number;
                minimumInputBound: number;
                reserveToolContinuation: boolean;
            }> = {},
        ) =>
            db.transaction(async (tx) => {
                const turnId = randomUUID(),
                    conversationId = randomUUID(),
                    requestId = randomUUID();
                const execution = await conversationAdmission(policy)(tx, {
                    ownerId,
                    turnId,
                    conversationId,
                    requestId,
                    fingerprint: randomUUID(),
                    inputTokenBound: input.inputTokenBound ?? 1_000,
                    minimumInputBound: input.minimumInputBound ?? 1_000,
                    ...(input.reserveToolContinuation !== undefined
                        ? {
                              reserveToolContinuation:
                                  input.reserveToolContinuation,
                          }
                        : {}),
                });

                if (!execution.confirmationRequired) {
                    // A committed admission must have the owned feature row required
                    // by the deferred charging-policy integrity constraint.
                    const now = new Date(),
                        sourceId = randomUUID();
                    const preferences = {
                        mode: 'auto' as const,
                        replyLanguage: 'auto' as const,
                        tone: 'neutral' as const,
                        explanationLevel: 'auto' as const,
                    };

                    await tx.insert(conversationsTable).values({
                        id: conversationId,
                        ownerId,
                        sourceKind: 'dictionary',
                        sourceId,
                        source: { kind: 'dictionary', id: sourceId },
                        preferences,
                        createdAt: now,
                        updatedAt: now,
                    });

                    await tx.insert(conversationTurnsTable).values({
                        id: turnId,
                        conversationId,
                        ownerId,
                        requestId,
                        requestFingerprint: 'synthetic-admission',
                        status: 'queued',
                        authority: { sourceOwnerId: ownerId },
                        sourceSnapshot: {
                            version: '1',
                            title: 'Synthetic admission',
                            description: null,
                            studiedLanguage: 'fr',
                            provenance: 'saved',
                            material: [],
                        },
                        preferences,
                        execution,
                        usage: {
                            inputTokens: 0,
                            outputTokens: 0,
                            chargedCredits: '0',
                            estimated: false,
                        },
                        createdAt: now,
                        updatedAt: now,
                    });
                }

                return execution;
            });

        it('rejects unavailable current readiness before creating an action', async () => {
            await expect(admit()).rejects.toMatchObject({
                code: 'model_unavailable',
            });

            await client`select count(*)::integer as count from ai_credit_actions`.then(
                ([row]) => expect(row?.count).toBe(0),
            );
        });

        it('rejects a true irreducible minimum before a quote or action hold', async () => {
            await ready();
            await expect(
                admit({ inputTokenBound: 64_000, minimumInputBound: 64_001 }),
            ).rejects.toMatchObject({ code: 'context_too_large' });

            await client`select count(*)::integer as count from ai_credit_actions`.then(
                ([row]) => expect(row?.count).toBe(0),
            );
        });

        it('preserves reduced quotes and minimum output admission when reserving block continuation', async () => {
            await ready();
            for (const [budget, outputTokens] of [
                ['10', 3000],
                ['1.003', 1],
            ] as const) {
                await db
                    .insert(textAiPreferencesTable)
                    .values({
                        userId: ownerId,
                        mode: 'auto',
                        version: 1,
                        maxCreditsPerAction: budget,
                    })
                    .onConflictDoUpdate({
                        target: textAiPreferencesTable.userId,
                        set: { maxCreditsPerAction: budget },
                    });

                await expect(
                    admit({ reserveToolContinuation: true }),
                ).resolves.toMatchObject({
                    confirmationRequired: true,
                    quote: {
                        maximumCredits: budget,
                        approximateOutputTokens: outputTokens,
                    },
                });
            }
        });

        it('allows compactable history bounds while admitting the phase-one current input', async () => {
            await ready('operator');
            await expect(
                admit({ inputTokenBound: 64_000, minimumInputBound: 20_000 }),
            ).resolves.toMatchObject({
                admittedMaxInputTokens: 64_000,
            });
        });
    },
);
