import {
    findTextAiModel,
    textAiExecutionLimits,
} from '../../../../text-ai/application/text-ai-provider-catalog';
import { OperatorBudgetUnavailableError } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-operator-budget-participant';
import { ProviderCostAdmissionUnavailableError } from '../../../../ai-credits/domain/provider-cost-admission';
import { prepareLegacyAction } from '../../../../ai-credits/infrastructure/persistence/drizzle/legacy-action-accounting';
import {
    textAiProviderBudgetAllows as dictionaryGenerationProviderBudgetAllows,
    type TextAiProviderBudgetUsage as DictionaryGenerationProviderBudgetUsage,
    readTextAiCapacity,
} from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { DrizzleTextAiAdmissionParticipant } from '../../../../text-ai/infrastructure/persistence/drizzle/text-ai-admission-participant';
import { TextAiSelectionUnavailableError } from '../../../../text-ai/application/text-ai-admission-participant';
import { eq } from 'drizzle-orm';
import { DictionaryGenerationNotAvailableError } from '../../../application/dictionary-errors';
import { type DictionaryGenerationProviderBudgetPolicy } from '../../../application/ports/dictionary-generation-provider-policy';
import { dictionaryGenerationProviderCircuitTable } from './schema';
import type {
    JobRow,
    GenerationStoreContext,
    Transaction,
    ProviderExecution,
} from './generation-context';
import { generationLimits } from './generation-context';
import { providerCircuitKey } from './generation-provider-circuit';

export function persistedProviderBudget(
    job: Pick<
        JobRow,
        | 'providerInputCostMicrosPerMillionTokens'
        | 'providerMaxCostMicrosPerAttempt'
        | 'providerMaxInputTokensPerAttempt'
        | 'providerMaxOutputTokensPerAttempt'
        | 'providerOutputCostMicrosPerMillionTokens'
    >,
): DictionaryGenerationProviderBudgetPolicy {
    return {
        inputCostMicrosPerMillionTokens:
            job.providerInputCostMicrosPerMillionTokens,
        maxCostMicrosPerAttempt: job.providerMaxCostMicrosPerAttempt,
        maxInputTokensPerAttempt: job.providerMaxInputTokensPerAttempt,
        maxOutputTokensPerAttempt: job.providerMaxOutputTokensPerAttempt,
        outputCostMicrosPerMillionTokens:
            job.providerOutputCostMicrosPerMillionTokens,
    };
}

export async function assertGenerationAdmission(
    context: GenerationStoreContext,
    tx: Transaction,
    ownerId: string,
    format: string,
    now: Date,
): Promise<ProviderExecution> {
    const providerExecution = await activeProviderExecution(
        context,
        tx,
        ownerId,
        format,
        now,
    );

    if (context.aiCreditEnforcementEnabled && !providerExecution.snapshot)
        throw new DictionaryGenerationNotAvailableError();
    if (context.aiCreditEnforcementEnabled && providerExecution.snapshot) {
        const model = findTextAiModel(
            providerExecution.snapshot.providerId,
            providerExecution.snapshot.modelId,
        );

        if (!model) throw new DictionaryGenerationNotAvailableError();
        providerExecution.snapshot = {
            ...providerExecution.snapshot,
            ...textAiExecutionLimits(model, [format]),
            supportedFormats: [format],
        };

        try {
            providerExecution.snapshot = await prepareLegacyAction(
                tx,
                ownerId,
                'dictionary-generation',
                providerExecution.snapshot,
                now,
            );
        } catch (error) {
            if (
                error instanceof OperatorBudgetUnavailableError ||
                error instanceof ProviderCostAdmissionUnavailableError
            )
                throw new DictionaryGenerationNotAvailableError();

            throw error;
        }

        providerExecution.budget = providerExecution.snapshot.aggregateBudget;
        providerExecution.selectionVersion = 1;
    }

    const [providerCircuit] = await tx
        .select({
            openUntil: dictionaryGenerationProviderCircuitTable.openUntil,
        })
        .from(dictionaryGenerationProviderCircuitTable)
        .where(
            eq(
                dictionaryGenerationProviderCircuitTable.id,
                providerCircuitKey(format, providerExecution.snapshot),
            ),
        )
        .limit(1);

    if (providerCircuit?.openUntil && providerCircuit.openUntil > now)
        throw new DictionaryGenerationNotAvailableError();

    const capacity = await readTextAiCapacity(tx, {
        actorId: ownerId,
        now: now,
        budget: providerExecution.budget,
    });
    const counts = {
        global: capacity.globalQueued + capacity.globalRunning,
        owner: capacity.actorQueued + capacity.actorRunning,
        oldestRunnableQueuedAt: capacity.oldestRunnableAt,
    };

    if (
        Number(counts?.global ?? 0) >= generationLimits.globalQueued ||
        Number(counts?.owner ?? 0) >= generationLimits.ownerQueued ||
        (counts?.oldestRunnableQueuedAt !== null &&
            counts?.oldestRunnableQueuedAt !== undefined &&
            new Date(counts.oldestRunnableQueuedAt).getTime() <=
                now.getTime() - generationLimits.maxRunnableQueueAgeMs)
    )
        throw new DictionaryGenerationNotAvailableError();
    const providerAdmission = await providerBudgetUsage(
        tx,
        ownerId,
        now,
        providerExecution.budget,
    );
    const effectiveProviderAdmission = context.aiCreditEnforcementEnabled
        ? {
              ...providerAdmission,
              ownerSettledCostMicros: 0,
              ownerSettledInputTokens: 0,
              ownerSettledOutputTokens: 0,
          }
        : providerAdmission;

    if (
        !dictionaryGenerationProviderBudgetAllows(
            effectiveProviderAdmission,
            true,
            providerExecution.budget,
        )
    )
        throw new DictionaryGenerationNotAvailableError();

    return providerExecution;
}

export async function activeProviderExecution(
    context: GenerationStoreContext,
    tx: Transaction,
    ownerId: string,
    format: string,
    now: Date,
) {
    try {
        return await new DrizzleTextAiAdmissionParticipant(tx).resolve({
            userId: ownerId,
            format,
            now,
            legacyBudget: context.providerBudget,
        });
    } catch (error) {
        if (error instanceof TextAiSelectionUnavailableError)
            throw new DictionaryGenerationNotAvailableError();

        throw error;
    }
}

export async function providerBudgetUsage(
    tx: Transaction,
    ownerId: string,
    now: Date,
    policy: DictionaryGenerationProviderBudgetPolicy,
): Promise<DictionaryGenerationProviderBudgetUsage> {
    return (
        await readTextAiCapacity(tx, {
            actorId: ownerId,
            now,
            budget: policy,
        })
    ).providerUsage;
}
