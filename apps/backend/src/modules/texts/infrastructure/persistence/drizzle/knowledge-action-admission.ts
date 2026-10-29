import { createHmac, randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import {
    lockTextAiCapacity,
    readTextAiCapacity,
    textAiProviderBudgetAllows,
} from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { prepareLegacyAction } from '../../../../ai-credits/infrastructure/persistence/drizzle/legacy-action-accounting';
import { DrizzleAiCreditTransactionParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import {
    TextsAiError,
    type TextJobInput,
} from '../../../application/ports/texts-ai-provider';
import type { TextJobContext } from '../../../application/ports/texts-job-store';
import { preflightTextsRequest } from '../../ai/texts-ai-provider';
import { transaction } from './texts-job-admission';
import { reserveTextsAttempt } from './texts-job-accounting';
import type { TextsJobStoreContext } from './texts-job-persistence-support';
import type { TextsTransaction } from './texts-job-support';
import { textsAiJobsTable as jobs } from './texts-job-schema';

/** JSONB normalizes object-key order; identities must survive persisted readback. */
function canonicalActionJson(value: unknown): string {
    return JSON.stringify(value, (_key, current: unknown) => {
        if (!current || typeof current !== 'object' || Array.isArray(current))
            return current;

        return Object.fromEntries(
            Object.entries(current).sort(([left], [right]) => {
                if (left < right) return -1;
                if (left > right) return 1;

                return 0;
            }),
        );
    });
}

/** Reuse the durable Texts queue and its native dispatch/credit authority; never create a Text item. */
export async function enqueueKnowledgeTextAction(
    persistence: TextsJobStoreContext,
    ownerId: string,
    input: {
        operationId: string;
        purpose: 'field' | 'exercise-evaluation';
        payload: Extract<TextJobInput, { kind: 'text-translation' }>;
        authorize(tx: TextsTransaction): Promise<void>;
        attach(tx: TextsTransaction, jobId: string): Promise<void>;
    },
    context: TextJobContext,
) {
    context.signal.throwIfAborted();
    const policy = persistence.policy;
    if (!policy) throw new TextsAiError('generation_not_available');
    const fingerprint = createHmac('sha256', policy.fingerprintSecret)
        .update('knowledge-text-action:v1:')
        .update(
            canonicalActionJson({
                purpose: input.purpose,
                payload: input.payload,
            }),
        )
        .digest('hex');

    return transaction(persistence, async (tx) => {
        await lockTextAiCapacity(tx);
        await input.authorize(tx);
        const [previous] = await tx
            .select()
            .from(jobs)
            .where(
                and(
                    eq(jobs.ownerId, ownerId),
                    eq(jobs.operationId, input.operationId),
                ),
            )
            .for('update');

        if (previous) {
            if (previous.requestFingerprint !== fingerprint)
                throw new TextsAiError('idempotency_conflict');
            if (previous.expiresAt <= context.now)
                throw new TextsAiError('generation_proposal_expired');

            return previous;
        }

        const selected = await policy.resolveExecution(
            tx,
            ownerId,
            'text-translation:v4',
            context.now,
        );

        if (
            !selected.snapshot?.creditPricing ||
            !selected.revisionId ||
            selected.selectionVersion !== 1
        )
            throw new TextsAiError('generation_not_available');
        const snapshot = await prepareLegacyAction(
            tx,
            ownerId,
            'text-translation',
            selected.snapshot,
            context.now,
        );
        const budget = snapshot.aggregateBudget;
        preflightTextsRequest(input.payload, snapshot, budget);
        const capacity = await readTextAiCapacity(tx, {
            actorId: ownerId,
            now: context.now,
            budget,
        });

        if (
            capacity.globalQueued + capacity.globalRunning >=
                (policy.globalQueueLimit ?? 1000) ||
            capacity.actorQueued + capacity.actorRunning >=
                (policy.userQueueLimit ?? 5) ||
            !textAiProviderBudgetAllows(capacity.providerUsage, true, budget)
        )
            throw new TextsAiError('rate_limited');
        const credit = await new DrizzleAiCreditTransactionParticipant(
            tx,
        ).accountSummary(ownerId, context.now);
        const [job] = await tx
            .insert(jobs)
            .values({
                id: randomUUID(),
                ownerId,
                operationId: input.operationId,
                requestFingerprint: fingerprint,
                jobKind: 'text-translation',
                format: 'text-translation:v4',
                externalSourceKind:
                    input.purpose === 'field'
                        ? 'knowledge-field'
                        : 'knowledge-exercise',
                folderId: null,
                textId: null,
                expectedTextVersion: null,
                inputPayload: input.payload,
                selectedExecutionSnapshot: snapshot,
                executionRevisionId: selected.revisionId,
                maxAttempts: Math.min(2, policy.maxAttempts ?? 2),
                expiresAt: new Date(context.now.getTime() + 86_400_000),
                createdAt: context.now,
                updatedAt: context.now,
                nextAttemptAt: context.now,
                providerInputCostMicrosPerMillionTokens:
                    budget.inputCostMicrosPerMillionTokens,
                providerOutputCostMicrosPerMillionTokens:
                    budget.outputCostMicrosPerMillionTokens,
                providerMaxCostMicrosPerAttempt: budget.maxCostMicrosPerAttempt,
                providerMaxInputTokensPerAttempt:
                    budget.maxInputTokensPerAttempt,
                providerMaxOutputTokensPerAttempt:
                    budget.maxOutputTokensPerAttempt,
                providerReservationState: 'active',
                providerReservedAttempts: 1,
                providerReservedCostMicros: budget.maxCostMicrosPerAttempt,
                providerReservedInputTokens: budget.maxInputTokensPerAttempt,
                providerReservedOutputTokens: budget.maxOutputTokensPerAttempt,
                aiCreditAccounted: false,
                aiCreditPolicyMode: credit.policy.effectiveMode,
                aiCreditInputCreditsPerMillionTokens:
                    snapshot.creditPricing!.inputCreditsPerMillionTokens,
                aiCreditOutputCreditsPerMillionTokens:
                    snapshot.creditPricing!.outputCreditsPerMillionTokens,
                aiCreditMaxCreditsPerAttempt:
                    snapshot.creditPricing!.maxCreditsPerAttempt,
                aiCreditPricingRevision: snapshot.creditPricing!.revision,
            })
            .returning();

        await input.attach(tx, job!.id);
        await reserveTextsAttempt(tx, job!, 1, context.now);

        return job!;
    });
}
