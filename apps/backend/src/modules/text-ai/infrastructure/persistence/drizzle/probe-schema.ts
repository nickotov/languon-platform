import { sql } from 'drizzle-orm';
import {
    bigint,
    check,
    index,
    integer,
    jsonb,
    pgTable,
    text,
    timestamp,
    uuid,
} from 'drizzle-orm/pg-core';
import type {
    ProviderPrice,
    TextAiProbeFailure,
    ProviderNativeUsage,
    ProviderExecutionFacts,
} from '@languon/contracts';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';

/** Bounded operator authorizations and immutable completed probe expense provenance. */
export const textAiProbesTable = pgTable(
    'text_ai_probes',
    {
        id: uuid('id').primaryKey(),
        actorId: uuid('actor_id').references(() => usersTable.id, {
            onDelete: 'set null',
        }),
        routeId: text('route_id').notNull(),
        providerId: text('provider_id').notNull(),
        modelId: text('model_id').notNull(),
        kind: text('kind').$type<'quick' | 'flow'>().notNull(),
        flowId: text('flow_id'),
        fingerprint: text('fingerprint').notNull(),
        state: text('state').$type<'running' | 'passed' | 'failed'>().notNull(),
        failure: text('failure').$type<TextAiProbeFailure>(),
        evidenceHours: integer('evidence_hours').notNull(),
        day: text('day').notNull(),
        maximumMicros: bigint('maximum_micros', { mode: 'bigint' }).notNull(),
        costMicros: bigint('cost_micros', { mode: 'bigint' }),
        price: jsonb('price').$type<ProviderPrice>().notNull(),
        inputTokens: integer('input_tokens'),
        outputTokens: integer('output_tokens'),
        cacheReadTokens: integer('cache_read_tokens'),
        cacheWriteTokens: integer('cache_write_tokens'),
        providerUsage: jsonb('provider_usage').$type<ProviderNativeUsage>(),
        providerExecutionFacts: jsonb('provider_execution_facts').$type<
            Pick<ProviderExecutionFacts, 'endpointId' | 'serviceTier'>
        >(),
        measurement: text('measurement')
            .$type<'measured' | 'estimated' | 'unknown'>()
            .notNull()
            .default('unknown'),
        elapsedMs: integer('elapsed_ms'),
        firstOutputMs: integer('first_output_ms'),
        startedAt: timestamp('started_at', {
            mode: 'date',
            withTimezone: true,
        }).notNull(),
        completedAt: timestamp('completed_at', {
            mode: 'date',
            withTimezone: true,
        }),
        evidenceExpiresAt: timestamp('evidence_expires_at', {
            mode: 'date',
            withTimezone: true,
        }),
    },
    (t) => [
        index('text_ai_probes_day_idx').on(t.day),
        index('text_ai_probe_passed_flow_idx')
            .on(t.routeId, t.flowId, t.fingerprint, t.startedAt.desc())
            .where(sql`${t.state}='passed' and ${t.kind}='flow'`),
        index('text_ai_probe_flow_latest_idx')
            .on(t.routeId, t.flowId, t.startedAt.desc())
            .where(sql`${t.kind}='flow'`),
        index('text_ai_probe_failed_route_idx')
            .on(t.routeId, t.startedAt.desc())
            .where(
                sql`${t.state}='failed' and ${t.failure}<>'budget_insufficient'`,
            ),
        index('text_ai_probe_failed_hard_idx')
            .on(t.routeId, t.failure, t.startedAt.desc())
            .where(
                sql`${t.state}='failed' and ${t.failure} in ('model_retired','authorization_failed','invalid_output')`,
            ),
        index('text_ai_probe_failed_schema_idx')
            .on(t.routeId, t.flowId, t.startedAt.desc())
            .where(sql`${t.state}='failed' and ${t.failure}='invalid_output'`),
        index('text_ai_probe_failed_auth_idx')
            .on(t.providerId, t.startedAt.desc())
            .where(
                sql`${t.state}='failed' and ${t.failure}='authorization_failed'`,
            ),
        index('text_ai_probes_route_idx').on(t.routeId, t.startedAt),
        index('text_ai_probes_provider_idx').on(t.providerId, t.state),
        check(
            'text_ai_probe_state',
            sql`${t.state} in ('running','passed','failed')`,
        ),
        check(
            'text_ai_probe_kind',
            sql`${t.kind} in ('quick','flow') and (${t.kind} <> 'flow' or ${t.flowId} is not null)`,
        ),
        check(
            'text_ai_probe_cost',
            sql`${t.maximumMicros}>0 and (${t.costMicros} is null or (${t.costMicros}>=0 and (${t.costMicros}<=${t.maximumMicros} or (${t.state}='failed' and ${t.completedAt} is not null and coalesce(jsonb_typeof(${t.price}->'nativeRules')='object',false)))))`,
        ),
        check(
            'text_ai_probe_usage',
            sql`(${t.inputTokens} is null or ${t.inputTokens}>=0) and (${t.outputTokens} is null or ${t.outputTokens}>=0)`,
        ),
        check(
            'text_ai_probe_completion',
            sql`(${t.state}='running' and ${t.completedAt} is null) or (${t.state}<>'running' and ${t.completedAt} is not null)`,
        ),
    ],
);

/** Explicit operator attestation releases only the local provider slot; never rewrites expense. */
export const textAiProbeRecoveriesTable = pgTable(
    'text_ai_probe_recoveries',
    {
        probeId: uuid('probe_id')
            .primaryKey()
            .references(() => textAiProbesTable.id, { onDelete: 'restrict' }),
        actorId: uuid('actor_id').references(() => usersTable.id, {
            onDelete: 'set null',
        }),
        recoveredAt: timestamp('recovered_at', {
            mode: 'date',
            withTimezone: true,
        }).notNull(),
        reason: text('reason').notNull(),
    },
    (t) => [
        check(
            'text_ai_probe_recovery_reason',
            sql`char_length(${t.reason}) between 10 and 500`,
        ),
    ],
);
