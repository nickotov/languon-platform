import { sql } from 'drizzle-orm';
import { DrizzleCapabilityPolicyParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-capability-policy-participant';
import { readRoutingCandidateAuthorities } from './routing-candidate-authority';
import {
    enableAdmissionPolicyReadCache,
    discardAdmissionPolicyReads,
} from '../../../../ai-credits/infrastructure/persistence/drizzle/admission-policy-read-cache';
import type { TextAiFlowId } from '@languon/contracts';
import type { TextAiExecutionSnapshot } from '../../../application/text-ai-provider-catalog';
import type { TextAiRoutingAuthority } from '../../../application/text-ai-routing-authority';
import {
    textAiModelCatalog,
    textAiExecutionLimits,
} from '../../../application/text-ai-provider-catalog';
import {
    effectiveTextAiRouteIds,
    textAiCapabilityForFlow,
    textAiFlowForFormat,
    TextAiRoutingUnavailableError,
} from '../../../domain/text-ai-routing';
import {
    currentTextAiRouting,
    type TextAiRoutingTransaction,
} from './drizzle-text-ai-routing-store';
import { maximumTextPrice } from '../../../../ai-credits/domain/model-price';

async function computeAdminTextAiRouting(
    tx: TextAiRoutingTransaction,
    input: {
        format: string;
        now: Date;
        routeFingerprint?: (
            routeId: string,
            flowId: TextAiFlowId,
        ) => string | null;
        credentialConfigured: (
            providerId: TextAiExecutionSnapshot['providerId'],
        ) => boolean;
    },
    preparePricesOnly = false,
): Promise<{ snapshot: TextAiExecutionSnapshot; revisionId: string } | null> {
    enableAdmissionPolicyReadCache(tx);
    const revision = await currentTextAiRouting(tx);
    if (!revision) return null;
    const flowId = textAiFlowForFormat(input.format);
    const tariff = revision.configuration.flowTariffs[flowId];
    if (!tariff) {
        const policy = await new DrizzleCapabilityPolicyParticipant(tx).current(
            textAiCapabilityForFlow(flowId),
        );

        if (policy.funding === 'customer')
            throw new TextAiRoutingUnavailableError(
                'A reviewed flow tariff is missing.',
            );
    }

    const candidates: TextAiRoutingAuthority['candidates'] = [];
    const configured = effectiveTextAiRouteIds(
        revision.configuration,
        flowId,
    ).flatMap((routeId) => {
        const model = textAiModelCatalog.find(
            (entry) => `${entry.providerId}/${entry.id}` === routeId,
        );
        const fingerprint = input.routeFingerprint?.(routeId, flowId);
        if (
            !model ||
            model.retired === true ||
            model.providerId === 'evolink' ||
            !revision.configuration.enabledRouteIds.includes(routeId) ||
            !model.supportedFormats.includes(input.format) ||
            !input.credentialConfigured(model.providerId) ||
            !fingerprint
        )
            return [];

        return [{ routeId, model, fingerprint }];
    });
    const authority = await readRoutingCandidateAuthorities(
        tx,
        configured.map(({ routeId, model, fingerprint }) => ({
            routeId,
            providerId: model.providerId,
            modelId: model.id,
            fingerprint,
        })),
        flowId,
        input.now,
        !preparePricesOnly,
    );

    for (const { routeId, model, fingerprint } of configured) {
        const checked = authority.get(routeId);
        if (!checked?.allowed) continue;
        const price = checked.price;
        if (!price)
            throw new TextAiRoutingUnavailableError(
                'Reviewed provider pricing is missing.',
            );
        const rates = {
            inputCreditsPerMillionTokens:
                tariff?.inputCreditsPerMillionTokens ?? 0,
            outputCreditsPerMillionTokens:
                tariff?.outputCreditsPerMillionTokens ?? 0,
            cachedInputCreditsPerMillionTokens:
                tariff?.cachedInputCreditsPerMillionTokens ?? null,
        };
        const snapshot: TextAiExecutionSnapshot = {
            adapterRevision: model.adapterRevision,
            aggregateBudget: { ...model.aggregateBudget },
            credentialReference: model.credentialReference,
            creditPricing: {
                ...rates,
                revision: 1,
                rateRevisionId: revision.id,
                maxCreditsPerAttempt: maximumTextPrice(
                    model.aggregateBudget,
                    rates,
                ),
            },
            enabledModelIds: revision.configuration.enabledRouteIds.map((id) =>
                id.slice(id.indexOf('/') + 1),
            ),
            modelId: model.id,
            ...textAiExecutionLimits(model, [input.format]),
            providerId: model.providerId,
            supportedFormats: [input.format],
        };

        candidates.push({
            routeId,
            fingerprint,
            snapshot,
            providerPrice: price,
        });
    }

    const selected = candidates[0];
    if (!selected)
        throw new TextAiRoutingUnavailableError(
            'No configured compatible route is available.',
        );
    const routingAuthority: TextAiRoutingAuthority = {
        revisionId: revision.id,
        flowId,
        candidates,
        automaticReattemptLimit: 1,
        tariffPublished: tariff !== undefined,
    };

    return {
        revisionId: revision.id,
        snapshot: {
            ...selected.snapshot,
            routingAuthority,
        },
    };
}

type RoutingInput = Parameters<typeof computeAdminTextAiRouting>[1];
type RoutingResult = Awaited<ReturnType<typeof computeAdminTextAiRouting>>;
const preparedRouting = new WeakMap<TextAiRoutingTransaction, RoutingResult>();

/** Read-only work before the common capacity fence. The admission consumes this
 * at most once and verifies the current revision; no policy pin crosses the fence. */
export async function prepareAdminTextAiRouting(
    tx: TextAiRoutingTransaction,
    input: RoutingInput,
): Promise<void> {
    try {
        preparedRouting.set(
            tx,
            await computeAdminTextAiRouting(tx, input, true),
        );
    } catch (error) {
        // Expected configuration failures belong to actual admission, after replay/
        // source authorization. Never turn an idempotent replay into a model error.
        if (!(error instanceof TextAiRoutingUnavailableError)) throw error;
    } finally {
        discardAdmissionPolicyReads(tx);
    }
}

export async function resolveAdminTextAiRouting(
    tx: TextAiRoutingTransaction,
    input: RoutingInput,
): Promise<RoutingResult> {
    if (preparedRouting.has(tx)) {
        const prepared = preparedRouting.get(tx)!;
        preparedRouting.delete(tx);
        if (prepared?.snapshot.routingAuthority) {
            const candidates = prepared.snapshot.routingAuthority.candidates;
            // This exact health authority takes route fences and therefore runs
            // only AFTER the caller acquired the global capacity fence.
            const rows = await tx.execute(sql`
                select requested.route_id, public.languon_text_ai_route_dispatch_allowed(
                    requested.route_id,${prepared.snapshot.routingAuthority.flowId},requested.fingerprint,${input.now.toISOString()}::timestamptz
                ) as allowed,
                (select price.id from public.ai_provider_price_revisions price
                    where price.provider_id=requested.provider_id and price.model_id=requested.model_id
                        and price.meter='text-tokens' and price.effective_at<=${input.now.toISOString()}::timestamptz
                    order by price.effective_at desc,price.version desc limit 1) as current_price_id
                from jsonb_to_recordset(${JSON.stringify(candidates.map((candidate) => ({ route_id: candidate.routeId, fingerprint: candidate.fingerprint, provider_id: candidate.snapshot.providerId, model_id: candidate.snapshot.modelId })))}::jsonb)
                    as requested(route_id text,fingerprint text,provider_id text,model_id text)
                where exists(select 1 from public.text_ai_routing_state where id='global' and active_revision_id=${prepared.revisionId}::uuid)
            `);

            if (
                rows.length === candidates.length &&
                rows.every((row) =>
                    candidates.some(
                        (candidate) =>
                            candidate.routeId === row.route_id &&
                            candidate.providerPrice.id === row.current_price_id,
                    ),
                )
            ) {
                const allowed = new Set(
                    rows
                        .filter((row) => row.allowed === true)
                        .map((row) => String(row.route_id)),
                );
                const currentCandidates = candidates.filter((candidate) =>
                    allowed.has(candidate.routeId),
                );

                if (!currentCandidates.length)
                    throw new TextAiRoutingUnavailableError(
                        'No configured compatible route is available.',
                    );
                enableAdmissionPolicyReadCache(tx);

                return {
                    revisionId: prepared.revisionId,
                    snapshot: {
                        ...structuredClone(currentCandidates[0]!.snapshot),
                        routingAuthority: {
                            ...prepared.snapshot.routingAuthority,
                            candidates: structuredClone(currentCandidates),
                        },
                    },
                };
            }
        }
    }

    return computeAdminTextAiRouting(tx, input);
}
