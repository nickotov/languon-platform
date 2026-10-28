import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { AiCreditTransaction } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { DrizzleActionAccountingParticipant } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-action-accounting-participant';
import { DrizzleCapabilityPolicyParticipant } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-capability-policy-participant';
import {
    capabilityPolicyRevisionsTable,
    aiAccountingSettingsRevisionsTable,
} from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/capability-policy-schema';
import { aiCreditActionAttemptsTable as attempts } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/action-accounting-schema';
import { aiProviderPriceRevisionsTable as providerPrices } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/provider-price-schema';
import { pinProviderPrice } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-provider-prices';
import { aiProviderExpenseRecordsTable as expenses } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/accounting-schema';
import {
    conversationsTable,
    conversationTurnsTable,
} from '../../../src/modules/conversations/infrastructure/persistence/drizzle/schema';
import { lockTextAiCapacity } from '../../../src/infrastructure/text-ai/text-ai-capacity';
import { parseFixed } from '../../../src/modules/ai-credits/domain/accounting';
import { reviewedTextProviderBudget } from '../../../src/modules/ai-credits/domain/provider-cost-admission';
import type { ActionTariff } from '../../../src/modules/ai-credits/domain/action-pricing';

/** Real feature and policy proof for accounting tests; never disables production guards. */
export async function seedConversationActionAuthorityFixture(
    tx: AiCreditTransaction,
    input: {
        ownerId: string;
        actionId?: string;
        providerId?: string;
        modelId?: string;
        maximumMilli: bigint;
        funding?: 'customer' | 'operator' | 'unlimited';
        tariff?: ActionTariff;
        operatorMaximumMicros?: bigint;
    },
) {
    await lockTextAiCapacity(tx);
    const actionId = input.actionId ?? randomUUID(),
        at = new Date();
    const capability = new DrizzleCapabilityPolicyParticipant(tx);
    const settings = await capability.settings();
    if (
        !settings.maxProviderCostUsdPerAction ||
        !settings.maxProviderCostUsdPerAccountDay ||
        !settings.maxProviderCostUsdPerDay
    )
        await tx.insert(aiAccountingSettingsRevisionsTable).values({
            id: randomUUID(),
            version: settings.version + 1,
            defaultMaxCreditsPerAction: '1',
            maxProviderCostUsdPerAction: '1',
            maxProviderCostUsdPerAccountDay: '10',
            maxProviderCostUsdPerDay: '100',
            createdAt: at,
            reason: 'Synthetic disposable accounting fixture',
        });
    const providerId = input.providerId ?? 'synthetic',
        modelId = input.modelId ?? 'synthetic';
    if (
        !(await pinProviderPrice(tx, {
            providerId,
            modelId,
            meter: 'text-tokens',
            at,
        }))
    ) {
        await tx.insert(providerPrices).values({
            id: randomUUID(),
            providerId,
            modelId,
            meter: 'text-tokens',
            version: 1,
            effectiveAt: new Date('2020-01-01T00:00:00Z'),
            createdAt: at,
            data: {
                providerId,
                modelId,
                meter: 'text-tokens',
                inputUsdPerMillionTokens: '0.001',
                outputUsdPerMillionTokens: '0.001',
                cacheReadUsdPerMillionTokens: '0.001',
                cacheWriteUsdPerMillionTokens: '0.001',
                usdPer1000Characters: null,
                effectiveAt: '2020-01-01T00:00:00.000Z',
                sourceReference: 'Synthetic disposable fixture',
                sourceUrl: null,
                reason: 'Explicit synthetic provider rates',
            },
        });
    }
    const providerPrice = await pinProviderPrice(tx, {
        providerId,
        modelId,
        meter: 'text-tokens',
        at,
    });
    const configuredBudget = {
        maxInputTokensPerAttempt: 10000,
        maxOutputTokensPerAttempt: 10000,
        maxCostMicrosPerAttempt: Number(input.operatorMaximumMicros ?? 10000n),
        inputCostMicrosPerMillionTokens: Number(
            parseFixed(providerPrice!.inputUsdPerMillionTokens ?? '0', 6),
        ),
        outputCostMicrosPerMillionTokens: Number(
            parseFixed(providerPrice!.outputUsdPerMillionTokens ?? '0', 6),
        ),
    };
    const budget = providerPrice!.nativeRules
        ? reviewedTextProviderBudget(
              providerPrice,
              configuredBudget,
              undefined,
              { dispatchedAt: at.toISOString() },
          )
        : configuredBudget;
    const funding = input.funding ?? 'customer';
    const current = await capability.current('conversation');
    const policyFunding = funding === 'unlimited' ? 'customer' : funding;
    if (current.funding !== policyFunding)
        await tx.insert(capabilityPolicyRevisionsTable).values({
            id: randomUUID(),
            capability: 'conversation',
            funding: policyFunding,
            version: current.version + 1,
            createdAt: at,
            reason: 'Synthetic disposable accounting fixture',
        });
    const policy = await capability.pinAction({
        jobId: actionId,
        jobKind: 'conversation-turn',
        ownerId: input.ownerId,
        at,
    });
    const chatId = randomUUID(),
        sourceId = randomUUID();
    const preferences = {
        mode: 'auto' as const,
        replyLanguage: 'auto' as const,
        tone: 'neutral' as const,
        explanationLevel: 'auto' as const,
    };
    await tx.insert(conversationsTable).values({
        id: chatId,
        ownerId: input.ownerId,
        sourceKind: 'dictionary',
        sourceId,
        source: { kind: 'dictionary', id: sourceId },
        preferences,
        createdAt: at,
        updatedAt: at,
    });
    await tx.insert(conversationTurnsTable).values({
        id: actionId,
        ownerId: input.ownerId,
        conversationId: chatId,
        requestId: randomUUID(),
        requestFingerprint: 'synthetic-accounting-fixture',
        status: 'running',
        leaseToken: actionId,
        leaseUntil: new Date(at.getTime() + 60000),
        authority: { sourceOwnerId: input.ownerId },
        sourceSnapshot: {
            version: '1',
            title: 'Synthetic fixture',
            description: null,
            studiedLanguage: 'en',
            provenance: 'saved',
            material: [],
        },
        preferences,
        execution: {
            actionAccountingVersion: 1,
            funding,
            providerPrice,
            snapshot: { providerId, modelId, aggregateBudget: budget },
            budget,
            admittedMaxInputTokens: 10000,
        },
        usage: {
            inputTokens: 0,
            outputTokens: 0,
            chargedCredits: '0',
            estimated: false,
        },
        createdAt: at,
        updatedAt: at,
    });
    return {
        actionId,
        leaseToken: actionId,
        at,
        policy,
        funding,
        tariff: input.tariff ?? {
            inputCreditsPerMillionTokens: '1',
            outputCreditsPerMillionTokens: '1',
        },
    };
}

export async function reserveConversationActionFixture(
    tx: AiCreditTransaction,
    input: Parameters<typeof seedConversationActionAuthorityFixture>[1],
) {
    const { actionId, at, policy, funding, tariff } =
        await seedConversationActionAuthorityFixture(tx, input);
    return new DrizzleActionAccountingParticipant(tx).reserve({
        id: actionId,
        ownerId: input.ownerId,
        capability: 'conversation',
        funding,
        policyVersion: policy.version,
        tariff,
        budgetMilli: input.maximumMilli,
        holdMaximumMilli: input.maximumMilli,
        operatorMaximumMicros: input.operatorMaximumMicros ?? 10000n,
        at,
        deadlineAt: new Date(at.getTime() + 60000),
    });
}

/** The feature terminal and every numerical expense fact commit atomically with settlement. */
export async function settleConversationActionFixture(
    tx: AiCreditTransaction,
    input: {
        ownerId: string;
        actionId: string;
        outcome: 'success' | 'stopped' | 'failure';
    },
) {
    await lockTextAiCapacity(tx);
    const [existing] = await tx
        .select()
        .from(conversationTurnsTable)
        .where(eq(conversationTurnsTable.id, input.actionId));
    if (!existing) throw new Error('Synthetic feature proof is missing.');
    if (['queued', 'running'].includes(existing.status))
        await tx
            .update(conversationTurnsTable)
            .set({
                leaseToken: null,
                leaseUntil: null,
                status:
                    input.outcome === 'success'
                        ? 'succeeded'
                        : input.outcome === 'stopped'
                          ? 'cancelled'
                          : 'failed',
                cancelRequested: input.outcome === 'stopped',
                failureCode:
                    input.outcome === 'stopped'
                        ? 'explicit_stop'
                        : input.outcome === 'failure'
                          ? 'synthetic_failure'
                          : null,
            })
            .where(eq(conversationTurnsTable.id, input.actionId));
    const rows = await tx
        .select()
        .from(attempts)
        .where(eq(attempts.actionId, input.actionId));
    const participant = new DrizzleActionAccountingParticipant(tx);
    for (const attempt of rows) {
        if (attempt.state === 'dispatched')
            await participant.recordAttempt({
                actionId: input.actionId,
                ownerId: input.ownerId,
                callId: attempt.id,
                successful: false,
                operatorCostMicros: null,
                at: new Date(),
            });
        const [expense] = await tx
            .select()
            .from(expenses)
            .where(
                and(
                    eq(expenses.attemptId, attempt.id),
                    eq(expenses.actionId, input.actionId),
                ),
            );
        if (!expense)
            throw new Error(
                'Checked usage settlement did not record its provider expense.',
            );
    }
    return participant.settle({
        actionId: input.actionId,
        ownerId: input.ownerId,
        outcome: input.outcome,
        at: new Date(),
    });
}

export async function recordConversationAttemptFixture(
    tx: AiCreditTransaction,
    input: {
        ownerId: string;
        actionId: string;
        callId: string;
        successful: boolean;
        usage?: {
            inputTokens: number;
            outputTokens: number;
            cacheReadTokens?: number;
            cacheWriteTokens?: number;
        };
    },
) {
    await new DrizzleActionAccountingParticipant(tx).recordAttempt({
        ...input,
        operatorCostMicros: null,
        at: new Date(),
    });
    const [expense] = await tx
        .select()
        .from(expenses)
        .where(eq(expenses.attemptId, input.callId));
    if (!expense)
        throw new Error(
            'Checked usage settlement did not record its provider expense.',
        );
}
