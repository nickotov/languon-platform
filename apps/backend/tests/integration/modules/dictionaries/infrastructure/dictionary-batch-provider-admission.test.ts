import { randomUUID } from 'node:crypto';

import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
import { eq } from 'drizzle-orm';
import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import { databaseSchema } from '../../../../../src/infrastructure/database/schema';
import { aiCreditActionsTable } from '../../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/action-accounting-schema';
import { aiCreditAccountsTable } from '../../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/schema';
import { DrizzleDictionaryGenerationStore } from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-generation-store';
import { DrizzleDictionaryStore } from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-store';
import { DictionaryGenerationWorkerService } from '../../../../../src/modules/dictionaries/application/dictionary-generation-worker-service';
import {
    createDictionaryTextProviderRoutingAdapters,
    DictionaryTextProviderRouter,
} from '../../../../../src/modules/dictionaries/infrastructure/ai/dictionary-text-provider-router';
import { DeterministicImportPairsProposalGenerator } from '../../../../../src/modules/dictionaries/infrastructure/ai/import-pairs-proposal-generators';
import { DeterministicPastedTermsProposalGenerator } from '../../../../../src/modules/dictionaries/infrastructure/ai/pasted-terms-proposal-generators';
import { textAiModelCatalog } from '../../../../../src/modules/text-ai/application/text-ai-provider-catalog';
import {
    dictionaryAiConfigurationRevisionsTable,
    dictionaryAiConfigurationTable,
} from '../../../../../src/modules/text-ai/infrastructure/persistence/drizzle/configuration-schema';
import { usersTable } from '../../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { seedLegacyActionFixture } from '../../../../support/legacy-action-fixture';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../../support/test-database';

const run = describe.runIf(isDatabaseIntegrationEnabled());

run('accounted batch admission through the production provider router', () => {
    let client: PostgresClient;
    let database: ReturnType<
        typeof createDrizzleDatabase<typeof databaseSchema>
    >;
    let ownerId: string;
    let now: Date;
    const context = () => ({ now, signal: new AbortController().signal });

    beforeAll(() => {
        client = createTestPostgresClient();
        database = createDrizzleDatabase(client, databaseSchema);
    });
    beforeEach(async () => {
        await resetTestDatabase(client);
        await migrateTestDatabase(client);
        now = new Date();
        ownerId = randomUUID();
        await database.insert(usersTable).values({
            id: ownerId,
            status: 'active',
            createdAt: now,
            updatedAt: now,
        });
        await seedLegacyActionFixture(database);
        await database.insert(aiCreditAccountsTable).values({
            userId: ownerId,
            mode: 'unlimited',
            unlimitedUntil: null,
            createdAt: now,
            updatedAt: now,
        });
        const model = textAiModelCatalog[0]!;
        const revisionId = randomUUID();
        await database.insert(dictionaryAiConfigurationRevisionsTable).values({
            id: revisionId,
            version: 1,
            createdAt: now,
            createdByUserId: ownerId,
            catalogSnapshot: {
                adapterRevision: model.adapterRevision,
                aggregateBudget: model.aggregateBudget,
                credentialReference: model.credentialReference,
                creditPricing: model.creditPricing,
                enabledModelIds: [model.id],
                modelId: model.id,
                perCallMaxInputTokens: model.perCallMaxInputTokens,
                perCallMaxOutputTokens: model.perCallMaxOutputTokens,
                providerId: model.providerId,
                supportedFormats: [...model.supportedFormats],
            },
        });
        await database.insert(dictionaryAiConfigurationTable).values({
            id: 'global',
            version: 1,
            activeRevisionId: revisionId,
            updatedAt: now,
        });
    });
    afterEach(() => vi.unstubAllGlobals());
    afterAll(async () => client.end());

    it.each([
        ['pasted-terms', 1],
        ['import-pairs', 1],
    ] as const)(
        'executes an admitted %s job with %i rows through the real worker',
        async (kind, rowCount) => {
            const store = new DrizzleDictionaryGenerationStore(
                database,
                { generate: randomUUID },
                undefined,
                true,
            );
            const dictionaries = new DrizzleDictionaryStore(database, {
                generate: randomUUID,
            });
            const dictionary = await dictionaries.createDictionary({
                context: context(),
                fingerprint: `hmac-sha256:v1:${'A'.repeat(43)}`,
                idempotencyKey: randomUUID(),
                ownerId,
                request: {
                    name: 'Synthetic batch',
                    description: null,
                    sourceLanguage: 'en',
                    targetLanguage: 'fr',
                },
            });
            const common = {
                context: context(),
                fingerprint: `hmac-sha256:v1:${'B'.repeat(43)}`,
                idempotencyKey: randomUUID(),
                ownerId,
            };
            const enqueued =
                kind === 'pasted-terms'
                    ? await store.enqueuePastedTerms({
                          ...common,
                          dictionaryId: dictionary.id,
                          expectedDictionaryVersion: dictionary.version,
                          expectedSettingsVersion: dictionary.settings.version,
                          text: Array.from(
                              { length: rowCount },
                              (_, index) => `term${index}`,
                          ).join('\n'),
                          sharedContext: null,
                      })
                    : (
                          await store.enqueueImportPairs({
                              ...common,
                              importFingerprint: `hmac-sha256:v1:${'C'.repeat(43)}`,
                              instruction: null,
                              rows: Array.from(
                                  { length: rowCount },
                                  (_, rowIndex) => ({
                                      rowIndex,
                                      source: `term${rowIndex}`,
                                      translation: `traduction${rowIndex}`,
                                  }),
                              ),
                              target: {
                                  kind: 'existing',
                                  dictionaryId: dictionary.id,
                                  expectedDictionaryVersion: dictionary.version,
                                  expectedSettingsVersion:
                                      dictionary.settings.version,
                              },
                          })
                      ).job;
            const [action] = await database
                .select()
                .from(aiCreditActionsTable)
                .where(eq(aiCreditActionsTable.id, enqueued.id));
            expect(action).toMatchObject({
                state: 'active',
                funding: 'unlimited',
                outputLimit: 10_000,
            });
            const claimSpy = vi.spyOn(store, 'claim');
            const completeSpy = vi.spyOn(store, 'complete');
            // Only external HTTP is synthetic: accounting, durable admission,
            // worker chunk allocation, pinned routing and Mastra remain real.
            let providerCall = 0;
            const fetchProvider = vi.fn<typeof fetch>(async () => {
                const claim = await claimSpy.mock.results[0]!.value;
                if (!claim?.providerExecution)
                    throw new Error('Expected an admitted batch.');
                const start = providerCall++ * 20;
                const request = {
                    idempotencyKey: claim.id,
                    providerBudget: claim.providerBudget,
                    signal: new AbortController().signal,
                };
                const fixture =
                    claim.input.format === 'pasted-terms:v2'
                        ? await new DeterministicPastedTermsProposalGenerator().generate(
                              {
                                  ...request,
                                  input: {
                                      ...claim.input,
                                      rows: claim.input.rows.slice(
                                          start,
                                          start + 20,
                                      ),
                                  },
                              },
                          )
                        : claim.input.format === 'import-pairs:v2'
                          ? await new DeterministicImportPairsProposalGenerator().generate(
                                {
                                    ...request,
                                    input: {
                                        ...claim.input,
                                        rows: claim.input.rows.slice(
                                            start,
                                            start + 20,
                                        ),
                                    },
                                },
                            )
                          : (() => {
                                throw new Error('Unexpected batch format.');
                            })();
                return new Response(
                    JSON.stringify({
                        id: 'synthetic-batch-completion',
                        object: 'chat.completion',
                        created: 0,
                        model: 'deepseek-flash',
                        choices: [
                            {
                                index: 0,
                                finish_reason: 'stop',
                                message: {
                                    role: 'assistant',
                                    content: JSON.stringify(fixture.proposal),
                                },
                            },
                        ],
                        usage: {
                            prompt_tokens: 100,
                            completion_tokens: 30,
                            total_tokens: 130,
                        },
                    }),
                    { headers: { 'content-type': 'application/json' } },
                );
            });
            vi.stubGlobal('fetch', fetchProvider);
            const unexpected = {
                generate: async () => {
                    throw new Error('Unexpected unpinned provider.');
                },
            };
            const providers = createDictionaryTextProviderRoutingAdapters({
                legacy: {
                    card: unexpected,
                    cardAuthoring: unexpected,
                    importPairs: unexpected,
                    pastedTerms: unexpected,
                },
                router: new DictionaryTextProviderRouter({
                    credentials: { DEEPSEEK_API_KEY: 'synthetic-key' },
                }),
            });
            const worker = new DictionaryGenerationWorkerService({
                clock: { now: () => now },
                provider: providers.card,
                cardAuthoringProvider: providers.cardAuthoring,
                importPairsProvider: providers.importPairs,
                pastedTermsProvider: providers.pastedTerms,
                store,
            });
            await expect(
                worker.processNext({
                    signal: new AbortController().signal,
                    supportedFormats: [
                        kind === 'pasted-terms'
                            ? 'pasted-terms:v2'
                            : 'import-pairs:v2',
                    ],
                    workerId: 'synthetic-batch-worker',
                }),
            ).resolves.toBe(true);
            const claim = await claimSpy.mock.results[0]!.value;
            if (!claim?.providerExecution)
                throw new Error('Expected an admitted, pinned batch claim.');
            expect(claim.id).toBe(enqueued.id);
            expect(claim.providerBudget.maxOutputTokensPerAttempt).toBe(8_192);
            expect(claim.providerExecution.aggregateBudget).toEqual(
                claim.providerBudget,
            );
            const chunks = Math.ceil(rowCount / 20);
            expect(fetchProvider).toHaveBeenCalledTimes(chunks);
            const limits = fetchProvider.mock.calls.map(
                ([, init]) =>
                    (JSON.parse(String(init?.body)) as { max_tokens: number })
                        .max_tokens,
            );
            expect(limits).toEqual([8_192]);
            expect(completeSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    providerUsage: expect.objectContaining({
                        inputTokens: chunks * 100,
                        outputTokens: chunks * 30,
                    }),
                }),
            );
            expect(chunks * 30).toBeLessThanOrEqual(
                claim.providerBudget.maxOutputTokensPerAttempt,
            );
            await expect(
                store.read({ context: context(), jobId: claim.id, ownerId }),
            ).resolves.toMatchObject({ state: 'review' });
        },
    );
});
