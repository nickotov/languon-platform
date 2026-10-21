import { sql } from 'drizzle-orm';
import {
    check,
    index,
    integer,
    jsonb,
    pgTable,
    timestamp,
    uuid,
} from 'drizzle-orm/pg-core';
import type { PortraitState } from '@languon/contracts';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';

/** One bounded aggregate per account; no portrait revision copies. */
export const learnerPortraitsTable = pgTable(
    'learner_portraits',
    {
        ownerId: uuid('owner_id')
            .primaryKey()
            .references(() => usersTable.id),
        state: jsonb('state').$type<PortraitState>().notNull(),
        version: integer('version').notNull(),
        generation: integer('generation').notNull(),
        draftExpiresAt: timestamp('draft_expires_at', { withTimezone: true }),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    },
    (t) => [
        index('learner_portraits_expiry_idx').on(t.draftExpiresAt),
        check(
            'learner_portraits_versions_check',
            sql`${t.version} >= 0 and ${t.generation} >= 0 and (${t.state}->>'version')::integer = ${t.version} and (${t.state}->>'generation')::integer = ${t.generation}`,
        ),
        check(
            'learner_portraits_state_size_check',
            sql`octet_length(${t.state}::text) <= 100000`,
        ),
    ],
);

import { boolean, text, uniqueIndex } from 'drizzle-orm/pg-core';
import type {
    InterviewContext,
    InterviewSubmission,
} from '../../../application/ports/interview-store';
import type { PortraitInterviewerOutput } from '@languon/contracts';
export const learnerPortraitInterviewsTable = pgTable(
    'learner_portrait_interviews',
    {
        id: uuid('id').primaryKey(),
        ownerId: uuid('owner_id')
            .notNull()
            .references(() => usersTable.id),
        context: jsonb('context').$type<InterviewContext>().notNull(),
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    },
    (t) => [
        uniqueIndex('portrait_interviews_owner_unique').on(t.ownerId),
        index('portrait_interviews_expiry_idx').on(t.expiresAt),
        check(
            'portrait_interviews_context_size',
            sql`octet_length(${t.context}::text) <= 150000`,
        ),
    ],
);
/** Lease/accounting identities survive transcript erasure until settlement. */
export const learnerPortraitInterviewOperationsTable = pgTable(
    'learner_portrait_interview_operations',
    {
        id: uuid('id').primaryKey(),
        interviewId: uuid('interview_id').notNull(),
        ownerId: uuid('owner_id')
            .notNull()
            .references(() => usersTable.id),
        generation: integer('generation').notNull(),
        version: integer('version').notNull(),
        state: text('state')
            .$type<
                'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
            >()
            .notNull(),
        input: jsonb('input').$type<InterviewSubmission>().notNull(),
        context: jsonb('context').$type<InterviewContext>().notNull(),
        execution: jsonb('execution')
            .$type<Record<string, unknown>>()
            .notNull(),
        result: jsonb('result').$type<PortraitInterviewerOutput>(),
        errorCode: text('error_code'),
        idempotencyKey: uuid('idempotency_key').notNull(),
        fingerprint: text('fingerprint').notNull(),
        cancelRequested: boolean('cancel_requested').notNull().default(false),
        leaseToken: uuid('lease_token'),
        leaseUntil: timestamp('lease_until', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    },
    (t) => [
        uniqueIndex('portrait_operations_idempotency_unique').on(
            t.ownerId,
            t.idempotencyKey,
        ),
        uniqueIndex('portrait_operations_active_owner_unique')
            .on(t.ownerId)
            .where(sql`${t.state} in ('queued','running')`),
        index('portrait_operations_claim_idx').on(
            t.state,
            t.leaseUntil,
            t.createdAt,
        ),
        index('portrait_operations_interview_idx').on(t.interviewId),
        check(
            'portrait_operations_state_check',
            sql`${t.state} in ('queued','running','succeeded','failed','cancelled')`,
        ),
        check(
            'portrait_operations_versions_check',
            sql`${t.version} >= 0 and ${t.generation} >= 0`,
        ),
        check(
            'portrait_operations_context_size',
            sql`octet_length(${t.context}::text) <= 150000`,
        ),
    ],
);
