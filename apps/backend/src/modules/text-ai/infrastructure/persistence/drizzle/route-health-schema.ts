import { sql } from 'drizzle-orm';
import {
    check,
    index,
    pgTable,
    text,
    timestamp,
    uuid,
} from 'drizzle-orm/pg-core';

/** Safe runtime observations are independent from paid manual-check evidence and expense. */
export const textAiRouteHealthEventsTable = pgTable(
    'text_ai_route_health_events',
    {
        id: uuid('id').primaryKey(),
        attemptId: uuid('attempt_id').unique(),
        routeId: text('route_id').notNull(),
        providerId: text('provider_id').notNull(),
        flowId: text('flow_id').notNull(),
        fingerprint: text('fingerprint').notNull(),
        reason: text('reason')
            .$type<
                | 'model_retired'
                | 'model_unavailable'
                | 'authorization_failed'
                | 'invalid_output'
                | 'request_rejected'
                | 'schema_incompatible'
                | 'rate_limited'
                | 'provider_credits_exhausted'
                | 'provider_unavailable'
            >()
            .notNull(),
        observedAt: timestamp('observed_at', {
            mode: 'date',
            withTimezone: true,
        }).notNull(),
    },
    (t) => [
        index('text_ai_health_route_reason_idx').on(
            t.routeId,
            t.reason,
            t.observedAt.desc(),
        ),
        index('text_ai_health_flow_schema_idx')
            .on(t.routeId, t.flowId, t.observedAt.desc())
            .where(sql`${t.reason}='schema_incompatible'`),
        index('text_ai_health_provider_auth_idx')
            .on(t.providerId, t.observedAt.desc())
            .where(sql`${t.reason}='authorization_failed'`),
        index('text_ai_health_transient_idx')
            .on(t.routeId, t.observedAt.desc())
            .where(
                sql`${t.reason} in ('provider_unavailable','rate_limited','provider_credits_exhausted')`,
            ),
        index('text_ai_health_route_latest_idx').on(
            t.routeId,
            t.observedAt.desc(),
        ),
        check(
            'text_ai_health_reason',
            sql`${t.reason} in ('model_retired','model_unavailable','authorization_failed','invalid_output','request_rejected','schema_incompatible','rate_limited','provider_credits_exhausted','provider_unavailable')`,
        ),
        check(
            'text_ai_health_fingerprint',
            sql`${t.fingerprint} ~ '^[a-f0-9]{64}$'`,
        ),
    ],
);
