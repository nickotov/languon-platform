import { sql } from 'drizzle-orm';
import { ProviderPriceSchema, type ProviderPrice } from '@languon/contracts';
import type { TextAiRoutingTransaction } from './drizzle-text-ai-routing-store';

/** A bounded set (primary + at most four alternatives), checked in one statement.
 * The existing SQL health authority remains the sole runtime decision maker. */
export async function readRoutingCandidateAuthorities(
    tx: TextAiRoutingTransaction,
    candidates: Array<{
        routeId: string;
        providerId: string;
        modelId: string;
        fingerprint: string;
    }>,
    flowId: string,
    at: Date,
    checkHealth = true,
): Promise<Map<string, { allowed: boolean; price: ProviderPrice | null }>> {
    if (!candidates.length) return new Map();
    const rows = await tx.execute(sql`
        select requested.route_id, ${
            checkHealth
                ? sql`public.languon_text_ai_route_dispatch_allowed(
            requested.route_id,${flowId},requested.fingerprint,${at.toISOString()}::timestamptz)`
                : sql`true`
        } as allowed,
        price.data || jsonb_build_object(
            'id',price.id,'version',price.version,'createdBy',null,
            'createdAt',to_char(price.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'effectiveAt',price.effective_at,
            'reason','Pinned numerical provider price',
            'sourceReference','reviewed-rate:'||price.id::text,'sourceUrl',null
        ) as price
        from jsonb_to_recordset(${JSON.stringify(
            candidates.map((candidate) => ({
                route_id: candidate.routeId,
                provider_id: candidate.providerId,
                model_id: candidate.modelId,
                fingerprint: candidate.fingerprint,
            })),
        )}::jsonb) as requested(route_id text,provider_id text,model_id text,fingerprint text)
        left join lateral (
            select id,version,data,created_at,effective_at from public.ai_provider_price_revisions
            where provider_id=requested.provider_id and model_id=requested.model_id
                and meter='text-tokens' and effective_at<=${at.toISOString()}::timestamptz
            order by effective_at desc,version desc limit 1
        ) price on true
    `);

    return new Map(
        rows.map((row) => [
            String(row.route_id),
            {
                allowed: row.allowed === true,
                price:
                    row.price === null
                        ? null
                        : ProviderPriceSchema.parse(row.price),
            },
        ]),
    );
}
