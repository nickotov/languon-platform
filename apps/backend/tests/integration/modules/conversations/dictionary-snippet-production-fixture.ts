import { randomUUID } from 'node:crypto';
import type { PostgresJsDatabase } from '@languon/database';
import { and, desc, eq } from 'drizzle-orm';
import type { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { DrizzleAiCreditTransactionParticipant } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { capabilityPolicyRevisionsTable } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/capability-policy-schema';
import { aiProviderPriceRevisionsTable as providerPrices } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/provider-price-schema';
import { dictionaryAiWorkerObservationsTable } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/configuration-schema';
import { textAiModelCatalog } from '../../../../src/modules/text-ai/application/text-ai-provider-catalog';
import { textAiPreferencesTable } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/schema';
import { conversationExecutionObservationId } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-worker-readiness';
import { seedLegacyActionFixture } from '../../../support/legacy-action-fixture';
import { seedTextAiRoutingFixture } from '../../../support/text-ai-routing-fixture';

export const snippetModel = textAiModelCatalog.find(
    (item) =>
        item.providerId === 'openrouter' && item.id === 'openai/gpt-6-luna',
)!;

/** Synthetic rates deliberately differ from the catalog; production admission must pin these rates. */
export async function seedSnippetExecutionPrices(
    database: PostgresJsDatabase<typeof databaseSchema>,
) {
    await seedLegacyActionFixture(database, '1000');
    const [previous] = await database
        .select()
        .from(providerPrices)
        .where(
            and(
                eq(providerPrices.providerId, snippetModel.providerId),
                eq(providerPrices.modelId, snippetModel.id),
            ),
        )
        .orderBy(desc(providerPrices.version))
        .limit(1);
    const now = new Date();

    await database.insert(providerPrices).values({
        id: randomUUID(),
        providerId: snippetModel.providerId,
        modelId: snippetModel.id,
        meter: 'text-tokens',
        version: previous!.version + 1,
        effectiveAt: now,
        createdAt: now,
        data: {
            ...previous!.data,
            inputUsdPerMillionTokens: '0.125',
            outputUsdPerMillionTokens: '0.5',
            cacheReadUsdPerMillionTokens: '0.125',
            cacheWriteUsdPerMillionTokens: '0.125',
            effectiveAt: now.toISOString(),
            reason: 'Synthetic dictionary snippet execution rates',
        },
    });
}

export async function readySnippetExecutionRoute(
    database: PostgresJsDatabase<typeof databaseSchema>,
    ownerId: string,
    funding: 'operator' | 'customer',
) {
    const now = new Date();
    await database.insert(capabilityPolicyRevisionsTable).values({
        id: randomUUID(),
        capability: 'conversation',
        version: 1,
        funding,
        createdAt: now,
        reason: 'Synthetic dictionary snippet production regression',
    });

    await seedTextAiRoutingFixture(database, {
        routeId: `${snippetModel.providerId}/${snippetModel.id}`,
        replace: true,
        seedProbes: false,
        ...(funding === 'operator'
            ? { omittedTariffFlows: ['conversation'] }
            : {
                  tariff: {
                      inputCreditsPerMillionTokens: 1000,
                      outputCreditsPerMillionTokens: 500,
                      cachedInputCreditsPerMillionTokens: 1000,
                  },
              }),
    });

    await database.insert(dictionaryAiWorkerObservationsTable).values({
        id: conversationExecutionObservationId(
            'snippet-production-regression',
            snippetModel.providerId,
            snippetModel.id,
        ),
        workerId: 'snippet-production-regression',
        providerId: snippetModel.providerId,
        modelId: snippetModel.id,
        adapterRevision: snippetModel.adapterRevision,
        checkedAt: now,
        expiresAt: new Date(now.getTime() + 120_000),
        status: 'available',
        message: 'Synthetic default conversation execution readiness',
        textAiSelectionRevision: 1,
        textAiSupportedFormats: ['conversation:v1'],
        textAiCapacityRevision: 1,
        textsCapacityRevision: 1,
        conversationCapacityRevision: 1,
        conversationExecutionRevision: 1,
        creditSettlementRevision: 1,
    });

    if (funding === 'customer') {
        await database.insert(textAiPreferencesTable).values({
            userId: ownerId,
            mode: 'auto',
            maxCreditsPerAction: '60',
            version: 1,
        });

        await database.transaction((tx) =>
            new DrizzleAiCreditTransactionParticipant(tx).issueGrant({
                ownerId,
                amount: 1_000_000n,
                createdAt: now,
                expiresAt: null,
                source: 'admin',
                sourceReference: randomUUID(),
            }),
        );
    }
}

export function snippetStreamResponse(
    ordinal: number,
    action: { tool: string; arguments: unknown; id: string } | { text: string },
) {
    const tool = 'tool' in action;
    const delta = tool
        ? {
              tool_calls: [
                  {
                      index: 0,
                      id: action.id,
                      type: 'function',
                      function: {
                          name: action.tool,
                          arguments: JSON.stringify(action.arguments),
                      },
                  },
              ],
          }
        : { content: action.text };
    const common = {
        id: `synthetic-snippet-${ordinal}`,
        object: 'chat.completion.chunk',
        created: 1,
        model: snippetModel.id,
        provider: 'OpenAI',
    };
    const chunks = [
        {
            ...common,
            choices: [
                {
                    index: 0,
                    delta: { role: 'assistant', ...delta },
                    finish_reason: null,
                },
            ],
        },
        {
            ...common,
            choices: [
                {
                    index: 0,
                    delta: {},
                    finish_reason: tool ? 'tool_calls' : 'stop',
                },
            ],
            usage: {
                prompt_tokens: 50,
                completion_tokens: 8,
                total_tokens: 58,
                cost: 0.00001025,
            },
        },
    ];

    return new Response(
        chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') +
            'data: [DONE]\n\n',
        {
            headers: { 'content-type': 'text/event-stream' },
        },
    );
}

export function snippetObjectResponse(ordinal: number, value: unknown) {
    return Response.json({
        id: `synthetic-snippet-author-${ordinal}`,
        object: 'chat.completion',
        created: 1,
        model: snippetModel.id,
        provider: 'OpenAI',
        choices: [
            {
                index: 0,
                message: { role: 'assistant', content: JSON.stringify(value) },
                finish_reason: 'stop',
            },
        ],
        usage: {
            prompt_tokens: 50,
            completion_tokens: 8,
            total_tokens: 58,
            cost: 0.00001025,
        },
    });
}
