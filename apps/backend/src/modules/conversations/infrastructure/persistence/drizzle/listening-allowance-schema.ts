import { bigint, check, pgTable, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { conversationTurnsTable } from './schema';

/** Actor-admitted speech authority. The execution worker cannot issue or enlarge an allowance. */
export const listeningAllowances = pgTable(
    'conversation_listening_allowances',
    {
        rootTurnId: uuid('root_turn_id')
            .primaryKey()
            .references(() => conversationTurnsTable.id, {
                onDelete: 'cascade',
            }),
        ownerId: uuid('owner_id').notNull(),
        conversationId: uuid('conversation_id').notNull(),
        noteId: uuid('note_id').notNull(),
        branchId: uuid('branch_id').notNull(),
        // A confirmed "lesson if planned" quote permits later reallocation. Until
        // classification, its row has zero spendable speech credits/provider cost.
        preauthorizedCredits: bigint('preauthorized_credits', {
            mode: 'bigint',
        }),
        remainingCredits: bigint('remaining_credits', {
            mode: 'bigint',
        }).notNull(),
        remainingProviderMicros: bigint('remaining_provider_micros', {
            mode: 'bigint',
        }).notNull(),
    },
    (t) => [
        check(
            'conversation_listening_consent_unallocated',
            sql`${t.preauthorizedCredits} IS NULL OR (${t.preauthorizedCredits} >= 0 AND ${t.remainingCredits} = 0 AND ${t.remainingProviderMicros} = 0)`,
        ),
        check(
            'conversation_listening_allowance_nonnegative',
            sql`${t.remainingCredits} >= 0 and ${t.remainingProviderMicros} >= 0`,
        ),
    ],
);
