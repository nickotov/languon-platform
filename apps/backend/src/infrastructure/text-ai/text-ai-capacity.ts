import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../database/schema';
import type { TextAiProviderBudgetPolicy } from '../../modules/text-ai/application/text-ai-provider-catalog';

type Database = PostgresJsDatabase<typeof databaseSchema>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export const textAiCapacityLock = 4_312_189_072;
export interface TextAiProviderBudgetUsage {
    globalActiveCostMicros: number;
    globalActiveInputTokens: number;
    globalActiveOutputTokens: number;
    globalSettledCostMicros: number;
    globalSettledInputTokens: number;
    globalSettledOutputTokens: number;
    ownerActiveCostMicros: number;
    ownerActiveInputTokens: number;
    ownerActiveOutputTokens: number;
    ownerSettledCostMicros: number;
    ownerSettledInputTokens: number;
    ownerSettledOutputTokens: number;
}

// PostgreSQL transactions and savepoints have distinct adapter objects. Cache
// only this transaction's fence promise; never cache capacity or permissions.
const acquiredFences = new WeakMap<Transaction, Promise<void>>();
/** Acquire before user/job row locks. The marker is transaction-local and only
 * written after the common admission/claim lock has been acquired. */
export async function lockTextAiCapacity(tx: Transaction): Promise<void> {
    let acquired = acquiredFences.get(tx);
    if (!acquired) {
        acquired = (async () => {
            await tx.execute(
                sql`select pg_advisory_xact_lock(${textAiCapacityLock})`,
            );
            await tx.execute(
                sql`select set_config('languon.text_ai_capacity_revision', '1', true), set_config('languon.texts_capacity_revision', '1', true), set_config('languon.conversation_capacity_revision', '1', true), set_config('languon.portrait_capacity_revision', '1', true)`,
            );
        })();
        acquiredFences.set(tx, acquired);
    }
    try {
        await acquired;
    } catch (error) {
        acquiredFences.delete(tx);
        throw error;
    }
}

export async function hasSentenceCapacityOverlap(
    tx: Transaction,
    now: Date,
): Promise<boolean> {
    return hasCapacityOverlap(tx, now, [
        'sentence-generation',
        'sentence-check',
    ]);
}

export async function hasTextsCapacityOverlap(
    tx: Transaction,
    now: Date,
): Promise<boolean> {
    return hasCapacityOverlap(tx, now, [
        'text-detection',
        'text-translation',
        'text-selection-card',
    ]);
}

export async function hasConversationCapacityOverlap(
    tx: Transaction,
    now: Date,
): Promise<boolean> {
    return hasCapacityOverlap(tx, now, ['conversation-turn']);
}

async function hasCapacityOverlap(
    tx: Transaction,
    now: Date,
    kinds: readonly string[],
): Promise<boolean> {
    const rows =
        await tx.execute(sql`select languon_text_ai_has_capacity_overlap(
        array[${sql.join(
            kinds.map((kind) => sql`${kind}`),
            sql`, `,
        )}]::text[],
        ${now.toISOString()}::timestamptz) as overlap`);
    return rows[0]?.overlap === true;
}

/** Queue and active usage are transactionally maintained counters. Settled usage
 * uses minute aggregates plus the exact partial boundary minute, preserving the
 * strict rolling 24-hour window without scanning historical feature rows. */
export async function readTextAiCapacity(
    tx: Transaction,
    input: { actorId: string; now: Date; budget: TextAiProviderBudgetPolicy },
) {
    const { actorId, now, budget } = input;
    const windowStart = new Date(now.getTime() - 86_400_000);
    const boundaryEnd = new Date(
        Math.floor(windowStart.getTime() / 60_000) * 60_000 + 60_000,
    );
    const cohort = [
        budget.inputCostMicrosPerMillionTokens,
        budget.outputCostMicrosPerMillionTokens,
        budget.maxCostMicrosPerAttempt,
        budget.maxInputTokensPerAttempt,
        budget.maxOutputTokensPerAttempt,
    ].join(':');
    const counts = await tx.execute(sql`select
        coalesce(g.queued,0) as global_queued, coalesce(a.queued,0) as actor_queued,
        coalesce(g.running,0) as global_running, coalesce(a.running,0) as actor_running,
        (select min(created_at) from text_ai_capacity_jobs where state='queued' and runnable
            and next_attempt_at<=${now.toISOString()}::timestamptz) as oldest_runnable_at
        from (select 1) singleton
        left join text_ai_capacity_queue_totals g on g.scope='global'
        left join text_ai_capacity_queue_totals a on a.scope=${actorId}`);
    const usage = await tx.execute(sql`with settled as (
        select scope, sum(cost) as cost, sum(input_tokens) as input_tokens, sum(output_tokens) as output_tokens
        from text_ai_capacity_settled_buckets where scope in ('global',${actorId}) and cohort=${cohort}
            and minute>=${boundaryEnd.toISOString()}::timestamptz group by scope
        union all
        select 'global', coalesce(sum(cost),0), coalesce(sum(input_tokens),0), coalesce(sum(output_tokens),0)
        from text_ai_capacity_provider_usage where cohort=${cohort} and state='settled'
            and settled_at>${windowStart.toISOString()}::timestamptz and settled_at<${boundaryEnd.toISOString()}::timestamptz
        union all
        select ${actorId}, coalesce(sum(cost),0), coalesce(sum(input_tokens),0), coalesce(sum(output_tokens),0)
        from text_ai_capacity_provider_usage where cohort=${cohort} and state='settled' and owner_id=${actorId}::uuid
            and settled_at>${windowStart.toISOString()}::timestamptz and settled_at<${boundaryEnd.toISOString()}::timestamptz
    ), amounts as (
        select scope, true as active, cost, input_tokens, output_tokens from text_ai_capacity_active_totals
            where scope in ('global',${actorId}) and cohort=${cohort}
        union all select scope, false, cost, input_tokens, output_tokens from settled
    ) select
        coalesce(sum(cost) filter(where active and scope='global'),0) as global_active_cost,
        coalesce(sum(input_tokens) filter(where active and scope='global'),0) as global_active_input,
        coalesce(sum(output_tokens) filter(where active and scope='global'),0) as global_active_output,
        coalesce(sum(cost) filter(where not active and scope='global'),0) as global_settled_cost,
        coalesce(sum(input_tokens) filter(where not active and scope='global'),0) as global_settled_input,
        coalesce(sum(output_tokens) filter(where not active and scope='global'),0) as global_settled_output,
        coalesce(sum(cost) filter(where active and scope=${actorId}),0) as owner_active_cost,
        coalesce(sum(input_tokens) filter(where active and scope=${actorId}),0) as owner_active_input,
        coalesce(sum(output_tokens) filter(where active and scope=${actorId}),0) as owner_active_output,
        coalesce(sum(cost) filter(where not active and scope=${actorId}),0) as owner_settled_cost,
        coalesce(sum(input_tokens) filter(where not active and scope=${actorId}),0) as owner_settled_input,
        coalesce(sum(output_tokens) filter(where not active and scope=${actorId}),0) as owner_settled_output from amounts`);
    const c = counts[0];
    const u = usage[0];
    return {
        globalQueued: Number(c?.global_queued ?? 0),
        actorQueued: Number(c?.actor_queued ?? 0),
        globalRunning: Number(c?.global_running ?? 0),
        actorRunning: Number(c?.actor_running ?? 0),
        oldestRunnableAt:
            c?.oldest_runnable_at == null
                ? null
                : new Date(String(c.oldest_runnable_at)),
        providerUsage: {
            globalActiveCostMicros: Number(u?.global_active_cost ?? 0),
            globalActiveInputTokens: Number(u?.global_active_input ?? 0),
            globalActiveOutputTokens: Number(u?.global_active_output ?? 0),
            globalSettledCostMicros: Number(u?.global_settled_cost ?? 0),
            globalSettledInputTokens: Number(u?.global_settled_input ?? 0),
            globalSettledOutputTokens: Number(u?.global_settled_output ?? 0),
            ownerActiveCostMicros: Number(u?.owner_active_cost ?? 0),
            ownerActiveInputTokens: Number(u?.owner_active_input ?? 0),
            ownerActiveOutputTokens: Number(u?.owner_active_output ?? 0),
            ownerSettledCostMicros: Number(u?.owner_settled_cost ?? 0),
            ownerSettledInputTokens: Number(u?.owner_settled_input ?? 0),
            ownerSettledOutputTokens: Number(u?.owner_settled_output ?? 0),
        } satisfies TextAiProviderBudgetUsage,
    };
}

/** Maintenance-worker entry point; never invoke while admitting generation. */
export async function cleanupTextAiCapacity(
    tx: Transaction,
    now: Date,
    batchLimit = 1000,
): Promise<number> {
    const rows = await tx.execute(
        sql`select languon_text_ai_cleanup_capacity(${now.toISOString()}::timestamptz, ${batchLimit}) as removed`,
    );
    return Number(rows[0]?.removed ?? 0);
}

/** IDs identify only erased jobs; archive holds numerical cost/tokens and actor,
 * never input, answers, targets, dictionary IDs, or model request content. */
export async function archiveSentenceProviderUsage(
    tx: Transaction,
    input: {
        dictionaryIds?: readonly string[];
        jobIds?: readonly string[];
        now: Date;
    },
): Promise<void> {
    if (!input.dictionaryIds?.length && !input.jobIds?.length) return;
    const predicates = [
        input.dictionaryIds?.length
            ? sql`dictionary_id in (${sql.join(
                  input.dictionaryIds.map((id) => sql`${id}::uuid`),
                  sql`,`,
              )})`
            : sql`false`,
        input.jobIds?.length
            ? sql`id in (${sql.join(
                  input.jobIds.map((id) => sql`${id}::uuid`),
                  sql`,`,
              )})`
            : sql`false`,
    ];
    await tx.execute(sql`insert into dictionary_generation_provider_usage_archive (
        id, job_kind, owner_id, actual_cost_micros, actual_input_tokens, actual_output_tokens,
        input_cost_micros_per_million_tokens, output_cost_micros_per_million_tokens,
        max_cost_micros_per_attempt,max_input_tokens_per_attempt,max_output_tokens_per_attempt,settled_at,archived_at
    ) select id,job_kind,learner_id,provider_actual_cost_micros,provider_actual_input_tokens,provider_actual_output_tokens,
        provider_input_cost_micros_per_million_tokens,provider_output_cost_micros_per_million_tokens,
        provider_max_cost_micros_per_attempt,provider_max_input_tokens_per_attempt,provider_max_output_tokens_per_attempt,provider_reservation_settled_at,${input.now.toISOString()}::timestamptz
        from sentence_ai_jobs where (${sql.join(predicates, sql` or `)})
        and provider_reservation_state='settled' and provider_reservation_settled_at>${new Date(input.now.getTime() - 86_400_000).toISOString()}::timestamptz
        on conflict (id) do nothing`);
}

const providerOperationalBudget = {
    globalActiveAttempts: 10,
    ownerActiveAttempts: 3,
    dailyGlobalAttempts: 20,
    dailyOwnerAttempts: 3,
} as const;
export function textAiProviderBudgetAllows(
    usage: TextAiProviderBudgetUsage,
    includeNewReservation: boolean,
    policy: TextAiProviderBudgetPolicy,
): boolean {
    const reservation = includeNewReservation
        ? {
              costMicros: policy.maxCostMicrosPerAttempt,
              inputTokens: policy.maxInputTokensPerAttempt,
              outputTokens: policy.maxOutputTokensPerAttempt,
          }
        : { costMicros: 0, inputTokens: 0, outputTokens: 0 };
    return (
        usage.globalActiveCostMicros + reservation.costMicros <=
            policy.maxCostMicrosPerAttempt *
                providerOperationalBudget.globalActiveAttempts &&
        usage.globalActiveInputTokens + reservation.inputTokens <=
            policy.maxInputTokensPerAttempt *
                providerOperationalBudget.globalActiveAttempts &&
        usage.globalActiveOutputTokens + reservation.outputTokens <=
            policy.maxOutputTokensPerAttempt *
                providerOperationalBudget.globalActiveAttempts &&
        usage.ownerActiveCostMicros + reservation.costMicros <=
            policy.maxCostMicrosPerAttempt *
                providerOperationalBudget.ownerActiveAttempts &&
        usage.ownerActiveInputTokens + reservation.inputTokens <=
            policy.maxInputTokensPerAttempt *
                providerOperationalBudget.ownerActiveAttempts &&
        usage.ownerActiveOutputTokens + reservation.outputTokens <=
            policy.maxOutputTokensPerAttempt *
                providerOperationalBudget.ownerActiveAttempts &&
        usage.globalSettledCostMicros +
            usage.globalActiveCostMicros +
            reservation.costMicros <=
            policy.maxCostMicrosPerAttempt *
                providerOperationalBudget.dailyGlobalAttempts &&
        usage.globalSettledInputTokens +
            usage.globalActiveInputTokens +
            reservation.inputTokens <=
            policy.maxInputTokensPerAttempt *
                providerOperationalBudget.dailyGlobalAttempts &&
        usage.globalSettledOutputTokens +
            usage.globalActiveOutputTokens +
            reservation.outputTokens <=
            policy.maxOutputTokensPerAttempt *
                providerOperationalBudget.dailyGlobalAttempts &&
        usage.ownerSettledCostMicros +
            usage.ownerActiveCostMicros +
            reservation.costMicros <=
            policy.maxCostMicrosPerAttempt *
                providerOperationalBudget.dailyOwnerAttempts &&
        usage.ownerSettledInputTokens +
            usage.ownerActiveInputTokens +
            reservation.inputTokens <=
            policy.maxInputTokensPerAttempt *
                providerOperationalBudget.dailyOwnerAttempts &&
        usage.ownerSettledOutputTokens +
            usage.ownerActiveOutputTokens +
            reservation.outputTokens <=
            policy.maxOutputTokensPerAttempt *
                providerOperationalBudget.dailyOwnerAttempts
    );
}
