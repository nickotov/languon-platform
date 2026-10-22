import { sql } from 'drizzle-orm';
import {
    boolean,
    check,
    pgTable,
    text,
    timestamp,
    uuid,
} from 'drizzle-orm/pg-core';
import { aiCreditActionsTable } from './action-accounting-schema';

/** Trigger-owned terminal proof survives erasure of private feature content. */
export const aiCreditActionAuthoritiesTable = pgTable(
    'ai_credit_action_authorities',
    {
        actionId: uuid('action_id')
            .primaryKey()
            .references(() => aiCreditActionsTable.id, { onDelete: 'cascade' }),
        featureOwnerId: uuid('feature_owner_id').notNull(),
        jobKind: text('job_kind').notNull(),
        terminalState: text('terminal_state').notNull(),
        explicitStop: boolean('explicit_stop').notNull(),
        outcome: text('outcome').notNull(),
        attestedAt: timestamp('attested_at', { withTimezone: true }).notNull(),
    },
    (t) => [
        check(
            'ai_credit_action_authority_outcome',
            sql`${t.outcome} in ('success','stopped','failure')`,
        ),
    ],
);
