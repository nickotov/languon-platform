import {
    hasSentenceCapacityOverlap,
    hasTextsCapacityOverlap,
    hasConversationCapacityOverlap,
} from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { and, eq, gt, or, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import { ensureActionBudgetDefault } from './action-budget-default';
import { resolveAdminTextAiRouting } from './routing-admission';
import { dictionaryAiWorkerObservationsTable as observations } from './configuration-schema';
import {
    TextAiSelectionUnavailableError,
    type TextAiAdmissionParticipant,
} from '../../../application/text-ai-admission-participant';
import {
    defaultTextAiAvailabilityPolicy,
    type TextAiAvailabilityPolicy,
} from './text-ai-catalog-query';
import {
    isConversationExecutionCapableObservation,
    isSentenceExecutionCapableObservation,
    isTextsExecutionCapableObservation,
    isTextAiSelectionCapableObservation,
    isTextAiCapacityCapableObservation,
    isTextsCapacityCapableObservation,
    isConversationCapacityCapableObservation,
} from './text-ai-worker-readiness';
import { isTextAiCircuitOpen } from '../../../../../infrastructure/text-ai/text-ai-circuit';
import {
    textAiFlowForFormat,
    TextAiRoutingUnavailableError,
} from '../../../domain/text-ai-routing';
import type { DrizzleModelPriceParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-model-price-participant';

type Database = PostgresJsDatabase<typeof databaseSchema>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** One transaction pins admin authorization and the caller's financial reservation. */
export class DrizzleTextAiAdmissionParticipant implements TextAiAdmissionParticipant {
    constructor(
        private readonly transaction: Transaction,
        private readonly policy: TextAiAvailabilityPolicy = defaultTextAiAvailabilityPolicy(),
        // Retained constructor compatibility during rolling deployment; customer
        // tariffs now come only from the routing revision, never model prices.
        _legacyPrices?: Pick<DrizzleModelPriceParticipant, 'current'>,
    ) {
        void _legacyPrices;
    }

    async resolve(input: Parameters<TextAiAdmissionParticipant['resolve']>[0]) {
        if (
            !this.policy.routingEnabled ||
            this.policy.pricingAdmissionEnabled === false
        )
            throw new TextAiSelectionUnavailableError();
        const tx = this.transaction;
        let managed: Awaited<ReturnType<typeof resolveAdminTextAiRouting>>;
        try {
            managed = await resolveAdminTextAiRouting(tx, {
                format: input.format,
                now: input.now,
                credentialConfigured: this.policy.credentialConfigured,
                ...(this.policy.routeFingerprint
                    ? { routeFingerprint: this.policy.routeFingerprint }
                    : {}),
            });
        } catch (error) {
            if (error instanceof TextAiRoutingUnavailableError)
                throw new TextAiSelectionUnavailableError();

            throw error;
        }

        if (!managed) throw new TextAiSelectionUnavailableError();
        let snapshot = managed.snapshot;
        const candidates = snapshot.routingAuthority!.candidates;
        const observed = await tx
            .select()
            .from(observations)
            .where(
                and(
                    or(
                        ...candidates.map(({ snapshot: candidate }) =>
                            and(
                                eq(
                                    observations.providerId,
                                    candidate.providerId,
                                ),
                                eq(observations.modelId, candidate.modelId),
                                eq(
                                    observations.adapterRevision,
                                    candidate.adapterRevision,
                                ),
                            ),
                        ),
                    ),
                    gt(observations.expiresAt, input.now),
                ),
            );
        const flow = textAiFlowForFormat(input.format);
        const conversationOverlap =
            flow === 'conversation' ||
            flow === 'portrait-interview' ||
            (await hasConversationCapacityOverlap(tx, input.now));
        const textsOverlap =
            flow.startsWith('text-') ||
            (await hasTextsCapacityOverlap(tx, input.now));
        const sharedOverlap =
            flow.startsWith('sentence-') ||
            textsOverlap ||
            conversationOverlap ||
            (await hasSentenceCapacityOverlap(tx, input.now));
        const ready: typeof candidates = [];
        for (const candidate of candidates) {
            const current = observed.filter(
                (row) =>
                    row.providerId === candidate.snapshot.providerId &&
                    row.modelId === candidate.snapshot.modelId &&
                    row.adapterRevision === candidate.snapshot.adapterRevision,
            );
            const currentSupports = (
                predicate: typeof isTextAiCapacityCapableObservation,
            ) =>
                current.some(
                    (row) =>
                        row.status !== 'unavailable' &&
                        predicate(
                            row,
                            input.requiredWorkerFormat ?? input.format,
                        ),
                );

            if (
                (conversationOverlap &&
                    !currentSupports(
                        isConversationCapacityCapableObservation,
                    )) ||
                (textsOverlap &&
                    !currentSupports(isTextsCapacityCapableObservation)) ||
                (sharedOverlap &&
                    !flow.startsWith('sentence-') &&
                    !flow.startsWith('text-') &&
                    flow !== 'conversation' &&
                    flow !== 'portrait-interview' &&
                    !currentSupports(isTextAiCapacityCapableObservation))
            )
                continue;
            const capable =
                flow === 'conversation' || flow === 'portrait-interview'
                    ? isConversationExecutionCapableObservation
                    : flow.startsWith('sentence-')
                      ? isSentenceExecutionCapableObservation
                      : flow.startsWith('text-')
                        ? isTextsExecutionCapableObservation
                        : isTextAiSelectionCapableObservation;

            if (
                current.some((row) => row.status === 'unavailable') ||
                !current.some(
                    (row) =>
                        row.status !== 'unavailable' &&
                        capable(
                            row,
                            input.requiredWorkerFormat ?? input.format,
                        ),
                )
            )
                continue;
            if (
                await isTextAiCircuitOpen(tx, {
                    execution: candidate.snapshot,
                    format: input.format,
                    now: input.now,
                })
            )
                continue;
            ready.push(candidate);
        }

        if (!ready.length) throw new TextAiSelectionUnavailableError();
        snapshot = {
            ...ready[0]!.snapshot,
            routingAuthority: {
                ...snapshot.routingAuthority!,
                candidates: ready,
            },
        };

        if (flow.startsWith('sentence-'))
            await tx.execute(
                sql`select set_config('languon.learning_execution_revision','1',true), set_config('languon.text_ai_selection_revision','1',true), set_config('languon.ai_credit_settlement_revision','1',true)`,
            );
        if (flow.startsWith('text-'))
            await tx.execute(
                sql`select set_config('languon.texts_execution_revision','1',true), set_config('languon.text_ai_selection_revision','1',true), set_config('languon.ai_credit_settlement_revision','1',true)`,
            );
        await ensureActionBudgetDefault(tx, input.userId, input.now);

        return {
            budget: snapshot.aggregateBudget,
            revisionId: managed.revisionId,
            snapshot,
            selectionVersion: 1 as const,
        };
    }
}
