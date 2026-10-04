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

/** Acquire before user/job row locks. The marker is transaction-local and only
 * written after the common admission/claim lock has been acquired. */
export async function lockTextAiCapacity(tx: Transaction): Promise<void> {
    await tx.execute(sql`select pg_advisory_xact_lock(${textAiCapacityLock})`);
    await tx.execute(
        sql`select set_config('languon.text_ai_capacity_revision', '1', true)`,
    );
}

export async function hasSentenceCapacityOverlap(
    tx: Transaction,
    now: Date,
): Promise<boolean> {
    const rows = await tx.execute(sql`select exists (
        select 1 from sentence_ai_jobs where execution_state in ('queued','running')
            or provider_reservation_state = 'active'
            or (provider_reservation_state = 'settled' and provider_reservation_settled_at > ${new Date(now.getTime() - 86_400_000).toISOString()}::timestamptz
                and (provider_actual_cost_micros > 0 or provider_actual_input_tokens > 0 or provider_actual_output_tokens > 0))
        union all
        select 1 from dictionary_generation_provider_usage_archive
            where job_kind in ('sentence-generation','sentence-check')
            and settled_at > ${new Date(now.getTime() - 86_400_000).toISOString()}::timestamptz
            and (actual_cost_micros > 0 or actual_input_tokens > 0 or actual_output_tokens > 0)
    ) as overlap`);
    return rows[0]?.overlap === true;
}

/** Closed typed union: dictionary jobs and sentence jobs share existing limits.
 * Provider usage remains grouped by the immutable five-field budget cohort. */
export async function readTextAiCapacity(
    tx: Transaction,
    input: {
        actorId: string;
        now: Date;
        budget: TextAiProviderBudgetPolicy;
    },
) {
    const { actorId, now, budget } = input;
    const windowStart = new Date(now.getTime() - 86_400_000);
    // Preserve the previous provider participant's bounded retention lifecycle.
    await tx.execute(
        sql`delete from dictionary_generation_provider_usage_archive where settled_at<=${windowStart.toISOString()}::timestamptz`,
    );
    const counts = await tx.execute(sql`with jobs as (
        select owner_id as actor_id, execution_state::text as execution_state, created_at, next_attempt_at, (input_payload->>'awaitingUpload') is distinct from 'true' as runnable from dictionary_generation_jobs
        union all
        select learner_id as actor_id, execution_state, created_at, next_attempt_at, true as runnable from sentence_ai_jobs
    ) select
        count(*) filter (where execution_state='queued') as global_queued,
        count(*) filter (where execution_state='queued' and actor_id=${actorId}::uuid) as actor_queued,
        count(*) filter (where execution_state='running') as global_running,
        count(*) filter (where execution_state='running' and actor_id=${actorId}::uuid) as actor_running,
        min(created_at) filter (where execution_state='queued' and runnable and next_attempt_at<=${now.toISOString()}::timestamptz) as oldest_runnable_at from jobs`);
    const usage = await tx.execute(sql`with live_jobs as (
        select id, owner_id as actor_id, provider_reservation_state::text as provider_reservation_state, provider_reservation_settled_at,
            provider_reserved_cost_micros, provider_reserved_input_tokens, provider_reserved_output_tokens,
            provider_actual_cost_micros, provider_actual_input_tokens, provider_actual_output_tokens,
            provider_input_cost_micros_per_million_tokens, provider_output_cost_micros_per_million_tokens,
            provider_max_cost_micros_per_attempt, provider_max_input_tokens_per_attempt, provider_max_output_tokens_per_attempt from dictionary_generation_jobs
        union all
        select id, learner_id as actor_id, provider_reservation_state, provider_reservation_settled_at,
            provider_reserved_cost_micros, provider_reserved_input_tokens, provider_reserved_output_tokens,
            provider_actual_cost_micros, provider_actual_input_tokens, provider_actual_output_tokens,
            provider_input_cost_micros_per_million_tokens, provider_output_cost_micros_per_million_tokens,
            provider_max_cost_micros_per_attempt, provider_max_input_tokens_per_attempt, provider_max_output_tokens_per_attempt from sentence_ai_jobs
    ), cohorts as (
        select * from live_jobs where provider_input_cost_micros_per_million_tokens=${budget.inputCostMicrosPerMillionTokens}
            and provider_output_cost_micros_per_million_tokens=${budget.outputCostMicrosPerMillionTokens}
            and provider_max_cost_micros_per_attempt=${budget.maxCostMicrosPerAttempt}
            and provider_max_input_tokens_per_attempt=${budget.maxInputTokensPerAttempt}
            and provider_max_output_tokens_per_attempt=${budget.maxOutputTokensPerAttempt}
    ), amounts as (
        select actor_id, provider_reservation_state='active' as active,
            case when provider_reservation_state='active' then provider_reserved_cost_micros else provider_actual_cost_micros end as cost,
            case when provider_reservation_state='active' then provider_reserved_input_tokens else provider_actual_input_tokens end as input_tokens,
            case when provider_reservation_state='active' then provider_reserved_output_tokens else provider_actual_output_tokens end as output_tokens
        from cohorts where provider_reservation_state='active' or
            (provider_reservation_state='settled' and provider_reservation_settled_at>${windowStart.toISOString()}::timestamptz
            and not exists(select 1 from dictionary_generation_provider_usage_archive a where a.id=cohorts.id))
        union all
        select owner_id as actor_id, false, actual_cost_micros, actual_input_tokens, actual_output_tokens
        from dictionary_generation_provider_usage_archive where settled_at>${windowStart.toISOString()}::timestamptz
            and input_cost_micros_per_million_tokens=${budget.inputCostMicrosPerMillionTokens}
            and output_cost_micros_per_million_tokens=${budget.outputCostMicrosPerMillionTokens}
            and max_cost_micros_per_attempt=${budget.maxCostMicrosPerAttempt}
            and max_input_tokens_per_attempt=${budget.maxInputTokensPerAttempt}
            and max_output_tokens_per_attempt=${budget.maxOutputTokensPerAttempt}
    ) select
        coalesce(sum(cost) filter(where active),0) as global_active_cost,
        coalesce(sum(input_tokens) filter(where active),0) as global_active_input,
        coalesce(sum(output_tokens) filter(where active),0) as global_active_output,
        coalesce(sum(cost) filter(where not active),0) as global_settled_cost,
        coalesce(sum(input_tokens) filter(where not active),0) as global_settled_input,
        coalesce(sum(output_tokens) filter(where not active),0) as global_settled_output,
        coalesce(sum(cost) filter(where active and actor_id=${actorId}::uuid),0) as owner_active_cost,
        coalesce(sum(input_tokens) filter(where active and actor_id=${actorId}::uuid),0) as owner_active_input,
        coalesce(sum(output_tokens) filter(where active and actor_id=${actorId}::uuid),0) as owner_active_output,
        coalesce(sum(cost) filter(where not active and actor_id=${actorId}::uuid),0) as owner_settled_cost,
        coalesce(sum(input_tokens) filter(where not active and actor_id=${actorId}::uuid),0) as owner_settled_input,
        coalesce(sum(output_tokens) filter(where not active and actor_id=${actorId}::uuid),0) as owner_settled_output from amounts`);
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
