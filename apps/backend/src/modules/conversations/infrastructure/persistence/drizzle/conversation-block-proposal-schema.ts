import type { LearningBlock } from '@languon/contracts';
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
import {
    knowledgeNotesTable,
    knowledgeWorkingBranchesTable,
} from '../../../../knowledge/infrastructure/persistence/drizzle/schema';
import { conversationsTable, conversationTurnsTable } from './schema';
export const conversationBlockProposalsTable = pgTable(
    'conversation_block_proposals',
    {
        id: uuid('id').primaryKey(),
        conversationId: uuid('conversation_id')
            .notNull()
            .references(() => conversationsTable.id, { onDelete: 'cascade' }),
        turnId: uuid('turn_id')
            .notNull()
            .unique()
            .references(() => conversationTurnsTable.id, {
                onDelete: 'cascade',
            }),
        noteId: uuid('note_id')
            .notNull()
            .references(() => knowledgeNotesTable.id, { onDelete: 'cascade' }),
        branchId: uuid('branch_id')
            .notNull()
            .references(() => knowledgeWorkingBranchesTable.id, {
                onDelete: 'cascade',
            }),
        baseBranchVersion: integer('base_branch_version').notNull(),
        blocks: jsonb('blocks').$type<LearningBlock[]>().notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
        appliedAt: timestamp('applied_at', { withTimezone: true }),
        appliedBranchVersion: integer('applied_branch_version'),
    },
    (t) => [
        index('conversation_block_proposals_conversation_idx').on(
            t.conversationId,
            t.createdAt,
        ),
        check(
            'conversation_block_proposals_version',
            sql`${t.baseBranchVersion}>0 and (${t.appliedBranchVersion} is null or ${t.appliedBranchVersion}>${t.baseBranchVersion})`,
        ),
        check(
            'conversation_block_proposals_applied',
            sql`(${t.appliedAt} is null) = (${t.appliedBranchVersion} is null)`,
        ),
    ],
);
