import { cardAuthoringProviderInputTokens } from '../../ai/card-authoring-input-envelope';
import type { TextSelectionRequest } from '@languon/contracts';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
    readTextAiCapacity,
    textAiProviderBudgetAllows,
} from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { ProviderCostAdmissionUnavailableError } from '../../../../ai-credits/domain/provider-cost-admission';
import { withActionBilling } from '../../../../ai-credits/infrastructure/persistence/drizzle/action-billing';
import { DrizzleAiCreditTransactionParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { OperatorBudgetUnavailableError } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-operator-budget-participant';
import { prepareLegacyAction } from '../../../../ai-credits/infrastructure/persistence/drizzle/legacy-action-accounting';
import { defaultTextAiProviderBudgetPolicy } from '../../../../text-ai/application/text-ai-provider-catalog';
import { DrizzleTextAiAdmissionParticipant } from '../../../../text-ai/infrastructure/persistence/drizzle/text-ai-admission-participant';
import { resolveTextSelection } from '../../../../texts/domain/text';
import {
    selectionProviderInput,
    TextSelectionError,
} from '../../../domain/text-selection';
import { dictionaryTextSelectionJobsTable as jobs } from './selection-card-schema';
import { reserveSelectionAttempt } from './text-selection-accounting';
import { resolveSelectionSource } from './text-selection-source';
import {
    selectionTarget,
    type SelectionTransaction,
} from './text-selection-target';

import type { TextSelectionStoreOptions } from './drizzle-text-selection-store';
import { selectionJobView } from './text-selection-lifecycle';

export async function enqueueSelectionJob(
    tx: SelectionTransaction,
    options: TextSelectionStoreOptions,
    clock: () => Date,
    ownerId: string,
    request: TextSelectionRequest,
    hash: string,
    shareKey?: string,
) {
    const [existing] = await tx
        .select()
        .from(jobs)
        .where(
            and(
                eq(jobs.ownerId, ownerId),
                eq(jobs.operationId, request.operationId),
            ),
        );

    if (existing) {
        if (existing.requestHash !== hash)
            throw new TextSelectionError('idempotency_conflict');

        return withActionBilling(
            tx,
            selectionJobView(existing),
            existing.id,
            existing.ownerId,
        );
    }

    if (options.admissionsEnabled === false)
        throw new TextSelectionError('provider_unavailable');
    const now = clock(),
        source = await resolveSelectionSource(
            tx,
            options,
            ownerId,
            request.source,
            shareKey,
            now,
        );
    const occurrence = resolveTextSelection(
        source.alignment,
        request.selection,
        source,
    );
    const target = await selectionTarget(
        tx,
        ownerId,
        request.target,
        occurrence.sourceLanguage,
        occurrence.targetLanguage,
        occurrence.phrase,
        request.confirmDuplicate,
    );
    const input = selectionProviderInput(
        {
            phrase: occurrence.phrase,
            sentence: occurrence.sentence,
            previousSentence: occurrence.previousSentence,
            nextSentence: occurrence.nextSentence,
            startOffset: occurrence.startOffset,
            endOffset: occurrence.endOffset,
            sourceLanguageTag: occurrence.sourceLanguage,
            targetLanguageTag: occurrence.targetLanguage,
        },
        target.settings,
        target.translationContext,
    );
    const selected = await new DrizzleTextAiAdmissionParticipant(
        tx,
        options.selectionPolicy,
    ).resolve({
        userId: ownerId,
        format: 'text-selection-card:v1',
        now,
        legacyBudget: defaultTextAiProviderBudgetPolicy,
    });

    if (!selected.snapshot)
        throw new TextSelectionError('provider_unavailable');
    try {
        selected.snapshot = await prepareLegacyAction(
            tx,
            ownerId,
            'text-selection-card',
            selected.snapshot!,
            now,
        );
    } catch (error) {
        if (
            error instanceof OperatorBudgetUnavailableError ||
            error instanceof ProviderCostAdmissionUnavailableError
        )
            throw new TextSelectionError('provider_unavailable');

        throw error;
    }

    selected.budget = selected.snapshot.aggregateBudget;
    // Match the provider ceiling before creating a job or reserving its budget.
    if (
        cardAuthoringProviderInputTokens(input) >
        Math.min(
            selected.budget.maxInputTokensPerAttempt,
            selected.snapshot.perCallMaxInputTokens,
        )
    )
        throw new TextSelectionError('model_input_too_large');
    const capacity = await readTextAiCapacity(tx, {
        actorId: ownerId,
        now,
        budget: selected.budget,
    });

    if (
        capacity.actorQueued >= 20 ||
        !textAiProviderBudgetAllows(
            capacity.providerUsage,
            true,
            selected.budget,
        )
    )
        throw new TextSelectionError('capacity_exceeded');
    const credit = selected.snapshot.creditPricing;
    if (!credit) throw new TextSelectionError('provider_unavailable');
    const creditSummary = await new DrizzleAiCreditTransactionParticipant(
        tx,
    ).accountSummary(ownerId, now);
    const [job] = await tx
        .insert(jobs)
        .values({
            id: randomUUID(),
            ownerId,
            operationId: request.operationId,
            requestHash: hash,
            inputPayload: input,
            sourceAuthority: source.authority,
            sourceOwnerId: source.sourceOwnerId,
            target: request.target,
            confirmDuplicate: request.confirmDuplicate,
            selectedExecutionSnapshot: selected.snapshot,
            maxAttempts: 2,
            executionRevisionId: selected.revisionId ?? null,
            providerInputCostMicrosPerMillionTokens:
                selected.budget.inputCostMicrosPerMillionTokens,
            providerOutputCostMicrosPerMillionTokens:
                selected.budget.outputCostMicrosPerMillionTokens,
            providerMaxCostMicrosPerAttempt:
                selected.budget.maxCostMicrosPerAttempt,
            providerMaxInputTokensPerAttempt:
                selected.budget.maxInputTokensPerAttempt,
            providerMaxOutputTokensPerAttempt:
                selected.budget.maxOutputTokensPerAttempt,
            providerReservedCostMicros: selected.budget.maxCostMicrosPerAttempt,
            providerReservedInputTokens:
                selected.budget.maxInputTokensPerAttempt,
            providerReservedOutputTokens:
                selected.budget.maxOutputTokensPerAttempt,
            aiCreditAccounted: false,
            aiCreditPolicyMode: creditSummary.policy.effectiveMode,
            aiCreditMaxCreditsPerAttempt: credit.maxCreditsPerAttempt,
            aiCreditInputCreditsPerMillionTokens:
                credit.inputCreditsPerMillionTokens,
            aiCreditOutputCreditsPerMillionTokens:
                credit.outputCreditsPerMillionTokens,
            expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
            createdAt: now,
            updatedAt: now,
            nextAttemptAt: now,
        })
        .returning();

    await reserveSelectionAttempt(tx, job!, 1, now);

    return withActionBilling(tx, selectionJobView(job!), job!.id, job!.ownerId);
}
