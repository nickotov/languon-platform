/** Test-only provider fixture. Uses production admission, persistence and worker
 * validation; never imports provider SDKs or loads development credentials. */
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createDrizzleDatabase, createPostgresClient } from '@languon/database';
import { databaseSchema } from '../../src/infrastructure/database/schema';
import { createSentenceWorkerComposition } from '../../src/modules/learning/infrastructure/sentence-composition';
import { DeterministicSentenceAiProvider } from '../../src/modules/learning/infrastructure/ai/sentence-ai-provider';
import { textAiModelCatalog } from '../../src/modules/text-ai/application/text-ai-provider-catalog';
import {
    dictionaryAiConfigurationRevisionsTable,
    dictionaryAiConfigurationTable,
    dictionaryAiWorkerObservationsTable,
} from '../../src/modules/text-ai/infrastructure/persistence/drizzle/configuration-schema';
import { sentenceExecutionObservationId } from '../../src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-worker-readiness';

const databaseUrl = process.env.AUTH_E2E_DATABASE_URL;
const runId = process.env.AUTH_E2E_RUN_ID;
if (
    process.env.APP_ENV !== 'test' ||
    !databaseUrl ||
    !runId ||
    process.env.AUTH_E2E_SENTENCE_SERVICES !== 'true'
) {
    throw new Error(
        'Sentence browser fixtures require explicit test-only opt-in.',
    );
}
if (!/^[a-zA-Z0-9-]{1,80}$/.test(runId))
    throw new Error('Sentence fixture run ID is invalid.');
const target = new URL(databaseUrl);
if (
    !['localhost', '127.0.0.1'].includes(target.hostname) ||
    !/(?:e2e|test)/i.test(target.pathname)
) {
    throw new Error(
        'Sentence fixtures require a disposable loopback test database.',
    );
}
const sql = createPostgresClient({ databaseUrl, maxConnections: 3 });
const database = createDrizzleDatabase(sql, databaseSchema);
const workerId = `sentence-web-e2e:${runId}`;
const model = textAiModelCatalog[0]!;
const controller = new AbortController();
process.once('SIGTERM', () => controller.abort());
process.once('SIGINT', () => controller.abort());
const fixture = new DeterministicSentenceAiProvider({
    async generate(input) {
        const entry = input.candidates.find(
            (item) => item.entryId === input.priorityEntryId,
        )!;
        await delay(entry.sourceText === 'slowbook' ? 3000 : 600);
        const sourceSuffix =
            input.sourceLanguage === 'ar'
                ? ' مفيد.'
                : input.sourceLanguage === 'ja'
                  ? 'は役に立ちます。'
                  : ' is useful.';
        const targetSuffix =
            input.targetLanguage === 'ar'
                ? ' مفيد.'
                : input.targetLanguage === 'ja'
                  ? 'は役に立ちます。'
                  : ' es útil.';
        return {
            sourceText: `${entry.sourceText}${sourceSuffix}`,
            referenceTranslation: `${entry.targetText}${targetSuffix}`,
            segments: [
                { text: entry.sourceText, entryId: entry.entryId },
                { text: sourceSuffix, entryId: null },
            ],
            targets: [
                {
                    entryId: entry.entryId,
                    normalizedHint: entry.targetText,
                    hintForm: 'lemma',
                },
            ],
        };
    },
    async check(input) {
        await delay(800);
        return {
            proposedPercentage: 100,
            meaning: 'correct',
            grammar: 'correct',
            targets: input.targets.map((entry) => ({
                entryId: entry.entryId,
                status: 'used' as const,
                explanation: 'Dictionary vocabulary is used.',
            })),
            issues: [],
            improvedTranslation: input.answer,
            explanation: 'The translation conveys the meaning correctly.',
        };
    },
});
// Known synthetic usage exercises real settlement and releases unused admission
// reservations. Omitting it intentionally invokes the production conservative
// maximum-cost fallback, which exhausts the cohort before this full suite ends.
const provider = {
    async generate(call: Parameters<typeof fixture.generate>[0]) {
        return {
            ...(await fixture.generate(call)),
            usage: { inputTokens: 50, outputTokens: 50 },
        };
    },
    async check(call: Parameters<typeof fixture.check>[0]) {
        return {
            ...(await fixture.check(call)),
            usage: { inputTokens: 50, outputTokens: 50 },
        };
    },
};
const { worker } = createSentenceWorkerComposition({
    database,
    provider,
    clock: { now: () => new Date() },
    workerId,
    leaseMs: 10_000,
    heartbeatMs: 100,
    timeoutMs: 5_000,
    globalConcurrency: 2,
    learnerConcurrency: 1,
    maxAttempts: 1,
    retryDelayMs: 1,
});
let configured =
    (await sql`select id from dictionary_ai_configuration where version > 0`)
        .length > 0;
const credited = new Set<string>();
async function prepareFixtures() {
    const users = await sql<
        { user_id: string; email: string }[]
    >`select user_id, email from user_emails where email like ${`sentence-e2e-${runId}-%@example.test`}`;
    if (!configured && users[0]) {
        const revision = randomUUID();
        await database.transaction(async (tx) => {
            await tx.insert(dictionaryAiConfigurationRevisionsTable).values({
                id: revision,
                createdByUserId: users[0]!.user_id,
                version: 1,
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
            await tx
                .insert(dictionaryAiConfigurationTable)
                .values({
                    id: 'global',
                    activeRevisionId: revision,
                    version: 1,
                })
                .onConflictDoUpdate({
                    target: dictionaryAiConfigurationTable.id,
                    set: { activeRevisionId: revision, version: 1 },
                });
        });
        configured = true;
    }
    for (const user of users) {
        if (credited.has(user.user_id)) continue;
        await sql`insert into ai_credit_accounts (user_id, mode) values (${user.user_id}, 'limited') on conflict do nothing`;
        // Readers intentionally receive zero credits to prove stored review is free.
        if (!user.email.includes('-reader-')) {
            await sql.begin(async (tx) => {
                const grant =
                    await tx`insert into ai_credit_grants (id, owner_id, amount, source, source_reference) values (${randomUUID()}, ${user.user_id}, 10000000, 'purchase', ${`sentence-web:${runId}:${user.user_id}`}) on conflict do nothing returning id`;
                if (grant.length)
                    await tx`insert into ai_credit_history (id, owner_id, amount, kind, grant_source) values (${randomUUID()}, ${user.user_id}, 10000000, 'grant', 'purchase')`;
            });
        }
        credited.add(user.user_id);
    }
    const now = new Date();
    const observation = {
        id: sentenceExecutionObservationId(
            workerId,
            model.providerId,
            model.id,
        ),
        workerId,
        providerId: model.providerId,
        modelId: model.id,
        adapterRevision: model.adapterRevision,
        checkedAt: now,
        expiresAt: new Date(now.getTime() + 60_000),
        message: 'Synthetic sentence browser provider',
        status: 'available',
        textAiSelectionRevision: 1,
        textAiSupportedFormats: ['sentence-generation:v1', 'sentence-check:v1'],
        textAiCapacityRevision: 1,
        learningExecutionRevision: 1,
        creditSettlementRevision: 1,
    };
    await database
        .insert(dictionaryAiWorkerObservationsTable)
        .values(observation)
        .onConflictDoUpdate({
            target: dictionaryAiWorkerObservationsTable.id,
            set: observation,
        });
}
console.log('Sentence browser fixture worker ready');
try {
    while (!controller.signal.aborted) {
        await prepareFixtures();
        await worker.processNext(controller.signal);
        await delay(50);
    }
} finally {
    await sql.end({ timeout: 5 });
}
