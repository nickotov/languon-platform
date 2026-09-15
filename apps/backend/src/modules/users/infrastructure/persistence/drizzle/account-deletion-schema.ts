import { sql } from 'drizzle-orm';
import {
    check,
    index,
    integer,
    pgEnum,
    pgTable,
    text,
    timestamp,
    uuid,
} from 'drizzle-orm/pg-core';

import { usersTable } from './schema';

export const accountDeletionStateEnum = pgEnum('account_deletion_state', [
    'pending',
    'running',
    'cancelled',
    'complete',
]);

export const accountDeletionRequestsTable = pgTable(
    'account_deletion_requests',
    {
        attemptCount: integer('attempt_count').default(0).notNull(),
        completedAt: timestamp('completed_at', { mode: 'date', withTimezone: true }),
        fencingToken: integer('fencing_token').default(0).notNull(),
        leaseDeadline: timestamp('lease_deadline', { mode: 'date', withTimezone: true }),
        leaseWorkerId: text('lease_worker_id'),
        nextAttemptAt: timestamp('next_attempt_at', { mode: 'date', withTimezone: true }).notNull(),
        purgeAt: timestamp('purge_at', { mode: 'date', withTimezone: true }).notNull(),
        scheduledAt: timestamp('scheduled_at', { mode: 'date', withTimezone: true }).notNull(),
        state: accountDeletionStateEnum('state').default('pending').notNull(),
        updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).notNull(),
        userId: uuid('user_id')
            .primaryKey()
            .references(() => usersTable.id, { onDelete: 'restrict' }),
    },
    (table) => [
        check('account_deletion_attempt_count_nonnegative', sql`${table.attemptCount} >= 0`),
        check('account_deletion_fencing_token_nonnegative', sql`${table.fencingToken} >= 0`),
        check('account_deletion_deadline', sql`${table.purgeAt} > ${table.scheduledAt} and ${table.nextAttemptAt} >= ${table.purgeAt}`),
        check('account_deletion_lease_shape', sql`(${table.state} = 'running' and ${table.leaseDeadline} is not null and ${table.leaseWorkerId} is not null) or (${table.state} <> 'running' and ${table.leaseDeadline} is null and ${table.leaseWorkerId} is null)`),
        check('account_deletion_completion_shape', sql`(${table.state} = 'complete' and ${table.completedAt} is not null) or (${table.state} <> 'complete' and ${table.completedAt} is null)`),
        index('account_deletion_due_idx').on(table.state, table.nextAttemptAt, table.userId),
        index('account_deletion_lease_idx').on(table.state, table.leaseDeadline),
    ],
);
