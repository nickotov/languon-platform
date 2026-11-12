import { RequestContext } from '@mastra/core/request-context';
import { noopObserve } from '@mastra/core/tools';
import { createDrizzleDatabase, createPostgresClient } from '@languon/database';
import { createHash, randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { databaseSchema } from '../../src/infrastructure/database/schema';
import { resolveMigrationsFolder } from '../../src/infrastructure/database/migrations-folder';
import { loadPlaygroundEnvironment } from '../../src/infrastructure/playground/playground-environment';
import { runPlaygroundLifecycle } from '../../src/infrastructure/playground/playground-lifecycle';
import { DevelopmentVerificationService } from '../../src/modules/development-harness/application/development-verification-service';
import { developmentHarnessFixture } from '../../src/modules/development-harness/infrastructure/development-fixture';
import { createDevelopmentHarnessPrimitives } from '../../src/modules/development-harness/infrastructure/mastra/development-harness-primitives';
import { DrizzleDevelopmentPrincipalReader } from '../../src/modules/development-harness/infrastructure/persistence/drizzle-development-principal-reader';
import { createTutorPlaygroundPrimitives } from '../../src/modules/development-harness/infrastructure/mastra/tutor-playground-primitives';
import { playgroundAccess } from '../../src/modules/development-harness/infrastructure/mastra/tutor-playground-sessions';
import { ConversationSourceResolver } from '../../src/modules/conversations/infrastructure/persistence/drizzle/conversation-source';
import { DrizzleConversationStore } from '../../src/modules/conversations/infrastructure/persistence/drizzle/drizzle-conversation-store';
import { DrizzleKnowledgeTransactionParticipant } from '../../src/modules/knowledge/infrastructure/persistence/drizzle/knowledge-transaction';
import { textAiModelCatalog } from '../../src/modules/text-ai/application/text-ai-provider-catalog';
import { dictionaryAiWorkerObservationsTable } from '../../src/modules/text-ai/infrastructure/persistence/drizzle/configuration-schema';
import { conversationExecutionObservationId } from '../../src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-worker-readiness';
import { seedContextualAssistantAccountingFixture } from '../support/contextual-assistant-accounting-fixture';
import { textAiFixtureCredentials } from '../support/text-ai-routing-fixture';
import { verifyTutorPlaygroundRecovery } from '../support/tutor-playground-recovery-fixture';

const enabled =
    process.env.ALLOW_MASTRA_PLAYGROUND_DATABASE_TESTS === 'true' &&
    typeof process.env.MASTRA_PLAYGROUND_TEST_ADMIN_DATABASE_URL === 'string';

async function editorContextForSession(
    target: ReturnType<typeof createPostgresClient>,
    sessionId: string,
) {
    const rows = await target<
        { branchId: string; version: number; content: { body: unknown } }[]
    >`
        select branch.id as "branchId", branch.version, branch.content
        from conversation_chats chat
        inner join knowledge_notes note on note.id = (chat.source->>'id')::uuid
        inner join knowledge_working_branches branch on branch.id = note.preferred_branch_id
        where chat.id = ${sessionId}
    `;
    const branch = rows[0];
    if (!branch) {
        throw new Error('The synthetic session has no working branch.');
    }

    const content = JSON.stringify(branch.content.body);

    return {
        content,
        workingBranch: { id: branch.branchId, version: branch.version },
        editorTarget: {
            documentHash: createHash('sha256').update(content).digest('hex'),
            from: content.length,
            to: content.length,
            originalText: '',
        },
    };
}

// @user-flow-revision mastra-agent-development-harness sha256:3e6da1ea942114b9
describe.runIf(enabled)('Mastra development harness journey', () => {
    // @user-flow mastra-agent-development-harness/playground-provision-run-persist-reset
    it('provisions, runs, persists, isolates, and safely resets the playground', async () => {
        const adminDatabaseUrl =
            process.env.MASTRA_PLAYGROUND_TEST_ADMIN_DATABASE_URL!;
        const adminUrl = new URL(adminDatabaseUrl);
        const ordinaryUrl = new URL(adminUrl);
        ordinaryUrl.pathname = '/languon';
        const targetUrl = new URL(adminUrl);
        targetUrl.pathname = '/languon_mastra_playground_e2e_test';
        const environment = loadPlaygroundEnvironment({
            APP_ENV: 'test',
            DATABASE_URL: ordinaryUrl.href,
            MASTRA_DEV_HARNESS: 'true',
            MASTRA_PLAYGROUND_ADMIN_DATABASE_URL: adminDatabaseUrl,
            MASTRA_PLAYGROUND_DATABASE_URL: targetUrl.href,
        });
        const migrationsFolder = resolveMigrationsFolder();

        const initialResults = await Promise.all([
            runPlaygroundLifecycle({
                environment,
                migrationsFolder,
                mode: 'provision',
            }),
            runPlaygroundLifecycle({
                environment,
                migrationsFolder,
                mode: 'provision',
            }),
        ]);

        expect(initialResults.map(({ created }) => created).sort()).toEqual([
            false,
            true,
        ]);

        expect(initialResults.every(({ reset }) => reset === false)).toBe(true);

        let target = createPostgresClient({ databaseUrl: targetUrl.href });
        const migrationCount = await target<{ count: string }[]>`
            select count(*) from languon_migrations.history
        `;
        const expectedMigrationCount = readdirSync(migrationsFolder).filter(
            (name) => name.endsWith('.sql'),
        ).length;
        const fixtures = await target<
            { id: string; status: string; verified_at: Date | null }[]
        >`
            select users.id, users.status, user_emails.verified_at
            from users
            inner join user_emails on user_emails.user_id = users.id
            where users.id = ${developmentHarnessFixture.principalId}
        `;

        expect(Number(migrationCount[0]?.count)).toBe(expectedMigrationCount);
        expect(fixtures).toEqual([
            expect.objectContaining({
                id: developmentHarnessFixture.principalId,
                status: 'active',
                verified_at: expect.any(Date),
            }),
        ]);

        const service = new DevelopmentVerificationService(
            new DrizzleDevelopmentPrincipalReader(
                createDrizzleDatabase(target, databaseSchema),
            ),
            developmentHarnessFixture.principalId,
        );
        const primitives = createDevelopmentHarnessPrimitives({
            fallbackModelId: 'deepseek/deepseek-flash',
            modelId: 'deepseek/deepseek-flash',
            service,
        });
        const requestContext = new RequestContext<{
            syntheticPrincipalId: string;
            variant: 'concise' | 'diagnostic';
        }>([
            ['syntheticPrincipalId', developmentHarnessFixture.principalId],
            ['variant', 'diagnostic'],
        ]);
        const workflowRun = await primitives.verificationWorkflow.createRun();
        const workflowResult = await workflowRun.start({
            inputData: { delayMs: 0, message: 'disposable journey' },
            requestContext,
        });

        expect(workflowResult).toMatchObject({
            result: {
                principalId: developmentHarnessFixture.principalId,
                trace: { primitive: 'workflow', status: 'success' },
            },
            status: 'success',
        });

        const score = await primitives.verificationScorer.run({
            input: {
                expectedPrincipalId: developmentHarnessFixture.principalId,
            },
            output:
                workflowResult.status === 'success'
                    ? workflowResult.result
                    : undefined!,
        });

        expect(score).toMatchObject({ score: 1 });

        // @user-flow mastra-agent-development-harness/tutor-generation-session-tools
        const tutorPlayground = createTutorPlaygroundPrimitives({
            database: createDrizzleDatabase(target, databaseSchema),
        });
        const tutorWorkflow = tutorPlayground.workflows.runTutorTurn;
        const vocabularyRun = await (
            await tutorWorkflow.createRun()
        ).start({
            inputData: {
                scenarioId: 'empty-owned',
                message: 'Generate 3 vocabulary words.',
            },
        });

        expect(vocabularyRun).toMatchObject({ status: 'success' });
        if (vocabularyRun.status !== 'success') {
            throw new Error(
                'The synthetic vocabulary workflow did not finish.',
            );
        }

        const vocabulary = vocabularyRun.result;
        expect(vocabulary).toMatchObject({
            status: 'succeeded',
            failureCode: null,
            sessionId: expect.any(String),
            proposals: [expect.objectContaining({ blocks: expect.any(Array) })],
        });

        const vocabularyProposal = vocabulary.proposals[0] as { id: string };

        const isolatedRun = await (
            await tutorWorkflow.createRun()
        ).start({
            inputData: {
                scenarioId: 'empty-owned',
                message: 'Generate grammar.',
            },
        });

        expect(isolatedRun).toMatchObject({ status: 'success' });
        if (isolatedRun.status !== 'success') {
            throw new Error('The isolated synthetic workflow did not finish.');
        }

        expect(isolatedRun.result.sessionId).not.toBe(vocabulary.sessionId);

        // A queued turn for the same synthetic owner must not be adopted by a
        // later scoped playground operation. Submit it through the production
        // store against another completed session so all DB guards participate.
        const claimStore = new DrizzleConversationStore({
            database: createDrizzleDatabase(target, databaseSchema),
            sources: new ConversationSourceResolver({
                verifyDictionaryShare: () => false,
                verifyTextShare: () => false,
                readNote: (tx, owner, id) =>
                    new DrizzleKnowledgeTransactionParticipant(tx).getForSource(
                        owner,
                        id,
                    ),
            }),
            admitTurn: async () => ({ playground: true }),
            publishNote: (tx, owner, input) =>
                new DrizzleKnowledgeTransactionParticipant(tx).publish(
                    owner,
                    input,
                ),
        });
        const unrelatedQueued = await claimStore.submit(
            playgroundAccess,
            isolatedRun.result.sessionId,
            {
                requestId: randomUUID(),
                content: 'Queued unrelated playground turn.',
                attachments: [],
                editorContext: await editorContextForSession(
                    target,
                    isolatedRun.result.sessionId,
                ),
            },
        );

        await expect(
            claimStore.claimForTurn(
                unrelatedQueued.id,
                '00000000-0000-4000-8000-000000000098',
            ),
        ).resolves.toBeNull();

        const exerciseRun = await (
            await tutorWorkflow.createRun()
        ).start({
            inputData: {
                scenarioId: 'empty-owned',
                sessionId: vocabulary.sessionId,
                message: 'Generate 2 exercises for those words.',
            },
        });

        expect(exerciseRun).toMatchObject({ status: 'success' });
        if (exerciseRun.status !== 'success') {
            throw new Error('The synthetic exercise workflow did not finish.');
        }

        expect(exerciseRun.result).toMatchObject({
            sessionId: vocabulary.sessionId,
            status: 'succeeded',
            failureCode: null,
            proposals: expect.arrayContaining([
                expect.objectContaining({ id: vocabularyProposal.id }),
            ]),
        });

        const unrelatedQueueState = await target<{ status: string }[]>`
            select status from conversation_turns where id = ${unrelatedQueued.id}
        `;

        expect(unrelatedQueueState).toEqual([{ status: 'queued' }]);
        await claimStore.stop(
            playgroundAccess,
            isolatedRun.result.sessionId,
            unrelatedQueued.id,
        );

        await expect(
            claimStore.claimForTurn(
                unrelatedQueued.id,
                playgroundAccess.ownerId,
            ),
        ).resolves.toBeNull();

        const cancelledQueueState = await target<{ status: string }[]>`
            select status from conversation_turns where id = ${unrelatedQueued.id}
        `;

        expect(cancelledQueueState).toEqual([{ status: 'cancelled' }]);
        await expect(
            verifyTutorPlaygroundRecovery({
                database: createDrizzleDatabase(target, databaseSchema),
            }),
        ).resolves.toEqual({
            expiredTurnStatus: 'failed',
            recoveredTurnStatus: 'running',
            postSubmitAbortStatus: 'cancelled',
            failedClaimStatus: 'cancelled',
        });

        const proposalReadback = await tutorPlayground.tools[
            'read-playground-proposal'
        ].execute!(
            {
                sessionId: vocabulary.sessionId,
                proposalId: vocabularyProposal.id,
            },
            { observe: noopObserve },
        );

        expect(proposalReadback).toMatchObject({
            sessionId: vocabulary.sessionId,
            proposal: expect.objectContaining({ id: vocabularyProposal.id }),
        });

        const grammar = await tutorPlayground.tools.generate_grammar.execute!(
            { instruction: 'Explain the present simple.', language: 'en' },
            {
                observe: noopObserve,
                requestContext: new RequestContext([
                    ['scenarioId', 'grammar-revision'],
                ]),
            },
        );

        expect(grammar).toMatchObject({
            result: expect.objectContaining({ status: 'ready' }),
            sessionId: expect.any(String),
        });

        await expect(
            tutorPlayground.tools['read-playground-proposal'].execute!(
                {
                    sessionId: isolatedRun.result.sessionId,
                    proposalId: vocabularyProposal.id,
                },
                { observe: noopObserve },
            ),
        ).rejects.toThrow('unavailable');

        // Live mode starts with no routed funding/configuration in this disposable
        // database. It must fail before a provider model can receive a request.
        const unconfiguredLiveTutor = createTutorPlaygroundPrimitives({
            database: createDrizzleDatabase(target, databaseSchema),
            mode: 'live',
        });
        const originalFetch = globalThis.fetch;
        const fetchSpy = vi.fn(originalFetch);
        vi.stubGlobal('fetch', fetchSpy);
        try {
            const liveRun = await (
                await unconfiguredLiveTutor.workflows.runTutorTurn.createRun()
            ).start({
                inputData: {
                    scenarioId: 'empty-owned',
                    message: 'Generate vocabulary through the live route.',
                },
            });

            expect(liveRun).toMatchObject({ status: 'failed' });
            expect(fetchSpy).not.toHaveBeenCalled();
        } finally {
            vi.unstubAllGlobals();
        }

        await seedContextualAssistantAccountingFixture(
            createDrizzleDatabase(target, databaseSchema),
        );

        await target`
            insert into ai_credit_accounts (user_id, mode)
            values (${playgroundAccess.ownerId}, 'limited')
        `;

        await target`
            insert into ai_credit_grants (id, owner_id, amount, source, source_reference)
            values (${randomUUID()}, ${playgroundAccess.ownerId}, 10000000, 'purchase', 'mastra-playground-live-e2e')
        `;

        await target`
            insert into ai_credit_history (id, owner_id, amount, kind, grant_source)
            values (${randomUUID()}, ${playgroundAccess.ownerId}, 10000000, 'grant', 'purchase')
        `;

        const liveModel = textAiModelCatalog.find(
            (model) => model.id === 'deepseek-flash',
        );

        if (!liveModel) {
            throw new Error('Missing live fixture model.');
        }

        const liveNow = new Date();
        await createDrizzleDatabase(target, databaseSchema)
            .insert(dictionaryAiWorkerObservationsTable)
            .values({
                id: conversationExecutionObservationId(
                    'mastra-playground-live-e2e',
                    liveModel.providerId,
                    liveModel.id,
                ),
                workerId: 'mastra-playground-live-e2e',
                providerId: liveModel.providerId,
                modelId: liveModel.id,
                adapterRevision: liveModel.adapterRevision,
                checkedAt: liveNow,
                expiresAt: new Date(liveNow.getTime() + 120_000),
                status: 'available',
                message: 'Synthetic live playground readiness.',
                textAiSelectionRevision: 1,
                textAiSupportedFormats: ['conversation:v1'],
                textAiCapacityRevision: 1,
                textsCapacityRevision: 1,
                conversationCapacityRevision: 1,
                conversationExecutionRevision: 1,
                creditSettlementRevision: 1,
            });

        let liveProviderCalls = 0;
        vi.stubGlobal('fetch', async () => {
            liveProviderCalls += 1;
            const content =
                liveProviderCalls === 1
                    ? JSON.stringify({
                          kind: 'answer',
                          purpose: 'learning-explanation',
                          documentUse: true,
                      })
                    : 'Synthetic live provider explanation.';
            const completion = {
                id: `live-${liveProviderCalls}`,
                object: 'chat.completion',
                created: 1,
                model: 'deepseek-chat',
                choices: [
                    {
                        index: 0,
                        message: { role: 'assistant', content },
                        finish_reason: 'stop',
                    },
                ],
                usage: {
                    prompt_tokens: 12,
                    completion_tokens: 8,
                    total_tokens: 20,
                    cost: 0.00001,
                },
            };

            if (liveProviderCalls > 1) {
                return new Response(
                    `data: ${JSON.stringify({
                        ...completion,
                        object: 'chat.completion.chunk',
                        choices: [
                            {
                                index: 0,
                                delta: { role: 'assistant', content },
                                finish_reason: null,
                            },
                        ],
                    })}\n\ndata: ${JSON.stringify({
                        ...completion,
                        object: 'chat.completion.chunk',
                        choices: [
                            { index: 0, delta: {}, finish_reason: 'stop' },
                        ],
                    })}\n\ndata: [DONE]\n\n`,
                    { headers: { 'content-type': 'text/event-stream' } },
                );
            }

            return new Response(JSON.stringify(completion), {
                headers: { 'content-type': 'application/json' },
            });
        });

        try {
            const configuredLiveTutor = createTutorPlaygroundPrimitives({
                database: createDrizzleDatabase(target, databaseSchema),
                mode: 'live',
                credentials: textAiFixtureCredentials,
            });
            const configuredLiveRun = await (
                await configuredLiveTutor.workflows.runTutorTurn.createRun()
            ).start({
                inputData: {
                    scenarioId: 'empty-owned',
                    message: 'Explain the saved material.',
                },
            });

            expect(configuredLiveRun).toMatchObject({ status: 'success' });
            if (configuredLiveRun.status !== 'success') {
                throw new Error('The configured live workflow did not finish.');
            }

            if (configuredLiveRun.result.status !== 'succeeded') {
                throw new Error(
                    JSON.stringify(configuredLiveRun.result.diagnostics),
                );
            }

            expect(configuredLiveRun.result).toMatchObject({
                status: 'succeeded',
                failureCode: null,
            });

            expect(liveProviderCalls).toBeGreaterThan(0);
            const expenses = await target<{ count: string }[]>`
                select count(*)::text as count
                from ai_provider_expense_records
                where action_id = ${configuredLiveRun.result.turnId}::uuid
            `;

            expect(Number(expenses[0]?.count)).toBeGreaterThan(0);
        } finally {
            vi.unstubAllGlobals();
        }

        await target`
            insert into users (id, status)
            values ('00000000-0000-4000-8000-000000000099', 'active')
        `;

        await target.end();

        const repeated = await runPlaygroundLifecycle({
            environment,
            migrationsFolder,
            mode: 'provision',
        });

        expect(repeated.created).toBe(false);

        target = createPostgresClient({ databaseUrl: targetUrl.href });
        const persistedMarker = await target<{ count: string }[]>`
            select count(*) from users
            where id = '00000000-0000-4000-8000-000000000099'
        `;

        expect(persistedMarker[0]?.count).toBe('1');

        // A fresh primitive factory models a development-server restart; proposal
        // readback must come from the persisted authoring store, not in-memory state.
        const restartedTutorPlayground = createTutorPlaygroundPrimitives({
            database: createDrizzleDatabase(target, databaseSchema),
        });

        await expect(
            restartedTutorPlayground.tools['read-playground-proposal'].execute!(
                {
                    sessionId: vocabulary.sessionId,
                    proposalId: vocabularyProposal.id,
                },
                { observe: noopObserve },
            ),
        ).resolves.toMatchObject({
            sessionId: vocabulary.sessionId,
            proposal: expect.objectContaining({ id: vocabularyProposal.id }),
        });

        await target.end();

        const ordinary = createPostgresClient({
            databaseUrl: ordinaryUrl.href,
        });
        const ordinaryHasUsers = await ordinary<{ users: string | null }[]>`
            select to_regclass('public.users')::text as users
        `;

        expect(ordinaryHasUsers[0]?.users).toBeNull();
        await ordinary.end();

        await expect(
            runPlaygroundLifecycle({
                environment,
                migrationsFolder,
                mode: 'reset',
            }),
        ).rejects.toThrow('Reset refused');

        const confirmedEnvironment = {
            ...environment,
            resetConfirmation: environment.databaseName,
        };
        const reset = await runPlaygroundLifecycle({
            environment: confirmedEnvironment,
            migrationsFolder,
            mode: 'reset',
        });

        expect(reset).toMatchObject({ created: true, reset: true });

        target = createPostgresClient({ databaseUrl: targetUrl.href });
        const afterReset = await target<
            { fixture_count: string; marker_count: string }[]
        >`
            select
                count(*) filter (
                    where id = ${developmentHarnessFixture.principalId}
                )::text as fixture_count,
                count(*) filter (
                    where id = '00000000-0000-4000-8000-000000000099'
                )::text as marker_count
            from users
        `;

        expect(afterReset[0]).toEqual({
            fixture_count: '1',
            marker_count: '0',
        });

        await target.end();

        await expect(
            Promise.all([
                runPlaygroundLifecycle({
                    environment,
                    migrationsFolder,
                    mode: 'provision',
                }),
                runPlaygroundLifecycle({
                    environment: confirmedEnvironment,
                    migrationsFolder,
                    mode: 'reset',
                }),
            ]),
        ).resolves.toHaveLength(2);

        target = createPostgresClient({ databaseUrl: targetUrl.href });
        const afterConcurrentLifecycle = await target<{ count: string }[]>`
            select count(*) from users
            where id = ${developmentHarnessFixture.principalId}
        `;

        expect(afterConcurrentLifecycle[0]?.count).toBe('1');
        await target.end();
    }, 30_000);
});
