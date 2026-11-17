import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { eq } from 'drizzle-orm';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import type { ClaimedConversationTurn } from '../../../../src/modules/conversations/application/ports/conversation-store';
import {
    generationValidationVersion,
    type GenerationArtifact,
} from '../../../../src/modules/conversations/application/ports/generation-run';
import { DrizzleConversationStore } from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/drizzle-conversation-store';
import { ConversationSourceResolver } from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/conversation-source';
import { conversationTurnsTable as turns } from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/schema';
import { settleInterruptedConversationCalls } from '../../../../src/modules/conversations/infrastructure/conversation-accounting';
import { DrizzleKnowledgeStore } from '../../../../src/modules/knowledge/infrastructure/persistence/drizzle/drizzle-knowledge-store';
import { DrizzleKnowledgeTransactionParticipant } from '../../../../src/modules/knowledge/infrastructure/persistence/drizzle/knowledge-transaction';
import { KnowledgeShareCrypto } from '../../../../src/modules/knowledge/infrastructure/knowledge-share-crypto';
import { DrizzleActionAccountingParticipant } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-action-accounting-participant';
import { DrizzleAiCreditTransactionParticipant } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import {
    reserveConversationActionFixture,
    recordConversationAttemptFixture,
} from '../../support/accounting-action-fixture';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

const budget = {
    maxInputTokensPerAttempt: 10000,
    maxOutputTokensPerAttempt: 10000,
    maxCostMicrosPerAttempt: 10000,
    inputCostMicrosPerMillionTokens: 1000,
    outputCostMicrosPerMillionTokens: 1000,
};
const body = {
    schemaVersion: 2 as const,
    document: {
        type: 'doc' as const,
        content: [
            {
                type: 'paragraph' as const,
                content: [
                    {
                        type: 'text' as const,
                        text: 'La démocratie se construit ensemble.',
                    },
                ],
            },
        ],
    },
};

/** Real owned source, lease, checkpoint/event transaction and customer settlement; no provider calls. */
describe.runIf(isDatabaseIntegrationEnabled())(
    'generation checkpoint accounting atomicity',
    () => {
        let client: PostgresClient;
        let db: PostgresJsDatabase<typeof databaseSchema>;
        let ownerId: string;
        let store: DrizzleConversationStore;
        let knowledge: DrizzleKnowledgeStore;

        beforeAll(async () => {
            client = createTestPostgresClient();
            db = createDrizzleDatabase(client, databaseSchema);
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
        }, 120000);

        afterAll(async () => {
            await client?.end();
        });

        beforeEach(async () => {
            await client`truncate ai_operator_attempt_costs,ai_operator_action_budgets,ai_operator_daily_budgets,ai_accounting_settings_revisions,users cascade`;
            await client`insert into ai_accounting_settings_revisions(id,version,default_max_credits_per_action,max_provider_cost_usd_per_action,max_provider_cost_usd_per_account_day,max_provider_cost_usd_per_day,created_at,reason) values(${randomUUID()},1,'1','1','10','100',now(),'Synthetic checkpoint regression')`;
            ownerId = randomUUID();
            await client`insert into users(id,status) values(${ownerId},'active')`;
            await db.transaction((tx) =>
                new DrizzleAiCreditTransactionParticipant(tx).issueGrant({
                    ownerId,
                    amount: 1000n,
                    createdAt: new Date(),
                    expiresAt: null,
                    source: 'admin',
                    sourceReference: randomUUID(),
                }),
            );

            knowledge = new DrizzleKnowledgeStore(
                db,
                { beforeNoteDeletion: async () => undefined },
                new KnowledgeShareCrypto(
                    'synthetic-generation-checkpoint-accounting-secret',
                ),
            );

            store = new DrizzleConversationStore({
                database: db,
                sources: new ConversationSourceResolver({
                    verifyDictionaryShare: () => false,
                    verifyTextShare: () => false,
                    readNote: (tx, actor, id) =>
                        new DrizzleKnowledgeTransactionParticipant(
                            tx,
                        ).getForSource(actor, id),
                }),
                // This test admits through the real accounting participant fixture below.
                admitTurn: async () => {
                    throw new Error(
                        'Use the checked financial admission fixture.',
                    );
                },
                settleInterrupted: settleInterruptedConversationCalls,
                publishNote: (tx, actor, value) =>
                    new DrizzleKnowledgeTransactionParticipant(tx).publish(
                        actor,
                        value,
                        new Date(),
                    ),
            });
        });

        async function preparedCheckpoint() {
            const note = await knowledge.create(ownerId, {
                operationId: randomUUID(),
                content: {
                    title: 'Synthetic French lesson',
                    summary: '',
                    categories: [],
                    studiedLanguage: 'fr',
                    explanationLanguage: 'en',
                    body,
                },
            });
            const workspace = await knowledge.getWorkspace(ownerId, note.id);
            const branch = workspace.branches.find(
                (value) => value.id === workspace.preferredBranchId,
            )!;
            const source = { kind: 'knowledge' as const, id: note.id };
            const chat = await store.create({ ownerId }, { source });
            const action = await db.transaction((tx) =>
                reserveConversationActionFixture(tx, {
                    ownerId,
                    conversationId: chat.id,
                    sourceSnapshot: {
                        version: `draft:${branch.version}`,
                        title: note.title,
                        description: note.summary,
                        studiedLanguage: 'fr',
                        provenance: 'draft',
                        material: [],
                        blockTarget: {
                            branchId: branch.id,
                            version: branch.version,
                        },
                    },
                    maximumMilli: 600n,
                    funding: 'customer',
                    tariff: {
                        inputCreditsPerMillionTokens: '1',
                        outputCreditsPerMillionTokens: '1',
                    },
                    operatorMaximumMicros: 10000n,
                }),
            );
            const [row] = await db
                .select()
                .from(turns)
                .where(eq(turns.id, action.id));
            const sourceSnapshot = row!.sourceSnapshot;

            const turn: ClaimedConversationTurn = {
                id: action.id,
                ownerId,
                conversationId: chat.id,
                leaseToken: action.id,
                authority: row!.authority,
                sourceSnapshot,
                execution: row!.execution,
                preferences: row!.preferences,
                source,
                conversationCreatedAt: chat.createdAt,
                message: {
                    id: randomUUID(),
                    role: 'user',
                    content: 'Create a short lesson.',
                    createdAt: new Date().toISOString(),
                },
            };

            expect(turn.execution.actionAccountingVersion).toBe(1);
            const run = await store.startGeneration(
                turn,
                {
                    schemaVersion: 1,
                    replyLanguage: 'en',
                    sources: [],
                    tasks: [
                        {
                            id: 'reading',
                            kind: 'prose',
                            instruction: 'Write a French reading.',
                            language: 'fr',
                            inputs: [],
                        },
                        {
                            id: 'summary',
                            kind: 'prose',
                            instruction: 'Summarize the reading.',
                            language: 'fr',
                            inputs: [{ kind: 'task', taskId: 'reading' }],
                        },
                    ],
                    outputOrder: ['reading', 'summary'],
                },
                [],
            );
            const callId = randomUUID();
            const validationId = randomUUID();
            await db.transaction(async (tx) => {
                const accounting = new DrizzleActionAccountingParticipant(tx);
                await accounting.admitAttempt({
                    actionId: action.id,
                    ownerId,
                    callId,
                    purpose: 'answer',
                    inputTokens: 100,
                    maxOutputTokens: 100,
                    budget,
                    executionWitness: {
                        jobId: action.id,
                        leaseToken: action.id,
                    },
                    at: new Date(),
                });

                await accounting.registerStructuredCall({
                    callId,
                    leaseToken: action.id,
                    validationId,
                });
            });

            await db.transaction((tx) =>
                recordConversationAttemptFixture(tx, {
                    actionId: action.id,
                    ownerId,
                    callId,
                    successful: true,
                    usage: { inputTokens: 100, outputTokens: 100 },
                }),
            );

            const artifact: GenerationArtifact = {
                id: randomUUID(),
                revision: 1,
                taskId: 'reading',
                batchKey: 'reading:1',
                taskComplete: true,
                body,
                contentHash: '',
                requirementsHash: '',
                sourceHash: '',
                validationVersion: generationValidationVersion,
            };
            const [cursor] =
                await client`select max(id)::integer as id from conversation_events where conversation_id=${chat.id}`;

            return {
                turn,
                runId: run.runId,
                artifact,
                validationId,
                callId,
                cursor: Number(cursor!.id),
            };
        }

        it('makes accepted usage visible with checkpoint SSE before an immediate Stop can settle', async () => {
            const fixture = await preparedCheckpoint();
            await store.checkpointGeneration(
                fixture.turn,
                [fixture.artifact],
                fixture.validationId,
            );

            const events = await store.events(
                { ownerId },
                fixture.turn.conversationId,
                fixture.cursor,
            );

            expect(events).toContainEqual(
                expect.objectContaining({
                    type: 'generation-run',
                    data: expect.objectContaining({ completedTaskCount: 1 }),
                }),
            );

            const [receipt] =
                await client`select accepted from ai_credit_structured_call_validations where attempt_id=${fixture.callId}`;

            expect(receipt!.accepted).toBe(true);

            // This is the original exploit ordering: Stop immediately after observing progress.
            await store.stop(
                { ownerId },
                fixture.turn.conversationId,
                fixture.turn.id,
            );

            await store.finish(fixture.turn, 'cancelled');
            const [action] =
                await client`select outcome,charged_milli::text from ai_credit_actions where id=${fixture.turn.id}`;

            expect(action).toEqual({ outcome: 'stopped', charged_milli: '1' });
            expect(
                await client`select id from conversation_generation_run_artifacts where id=${fixture.artifact.id}`,
            ).toHaveLength(1);

            const [run] =
                await client`select state,pause_reason from conversation_generation_runs where id=${fixture.runId}`;

            expect(run).toEqual({ state: 'paused', pause_reason: 'stopped' });
        });

        it('rolls back artifact and eligibility together when checkpoint event publication fails', async () => {
            const fixture = await preparedCheckpoint();
            await client.unsafe(
                `CREATE FUNCTION test_reject_checkpoint_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type='generation-run' AND NEW.data->>'completedTaskCount'='1' THEN RAISE EXCEPTION 'Synthetic checkpoint event failure'; END IF; RETURN NEW; END $$`,
            );

            await client.unsafe(
                'CREATE TRIGGER test_reject_checkpoint_event BEFORE INSERT ON conversation_events FOR EACH ROW EXECUTE FUNCTION test_reject_checkpoint_event()',
            );

            try {
                await expect(
                    store.checkpointGeneration(
                        fixture.turn,
                        [fixture.artifact],
                        fixture.validationId,
                    ),
                ).rejects.toMatchObject({
                    cause: { message: 'Synthetic checkpoint event failure' },
                });
            } finally {
                await client.unsafe(
                    'DROP TRIGGER test_reject_checkpoint_event ON conversation_events',
                );

                await client.unsafe(
                    'DROP FUNCTION test_reject_checkpoint_event()',
                );
            }

            const [receipt] =
                await client`select accepted from ai_credit_structured_call_validations where attempt_id=${fixture.callId}`;

            expect(receipt!.accepted).toBeNull();
            expect(
                await client`select id from conversation_generation_run_artifacts where id=${fixture.artifact.id}`,
            ).toHaveLength(0);

            expect(
                await store.events(
                    { ownerId },
                    fixture.turn.conversationId,
                    fixture.cursor,
                ),
            ).toHaveLength(0);

            await store.stop(
                { ownerId },
                fixture.turn.conversationId,
                fixture.turn.id,
            );

            await store.finish(fixture.turn, 'cancelled');
            const [action] =
                await client`select outcome,charged_milli::text from ai_credit_actions where id=${fixture.turn.id}`;

            expect(action).toEqual({ outcome: 'stopped', charged_milli: '0' });
        });
    },
);
