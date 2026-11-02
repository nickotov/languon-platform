import { index, pgTable, uuid } from 'drizzle-orm/pg-core';
import { knowledgeNotesTable } from './schema';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import { textsAiJobsTable } from '../../../../texts/infrastructure/persistence/drizzle/texts-job-schema';

/** Source identity is retained for cleanup; using it requires a live author-owned branch. */
export const knowledgeFieldJobSourcesTable = pgTable(
    'knowledge_field_job_sources',
    {
        jobId: uuid('job_id')
            .primaryKey()
            .references(() => textsAiJobsTable.id, { onDelete: 'cascade' }),
        actorId: uuid('actor_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        noteId: uuid('note_id')
            .notNull()
            .references(() => knowledgeNotesTable.id, { onDelete: 'cascade' }),
        // Retain the historical branch identity after conflict-branch cleanup so
        // permanent note deletion can still find and erase every admitted job.
        branchId: uuid('branch_id').notNull(),
        blockId: uuid('block_id').notNull(),
    },
    (table) => [
        index('knowledge_field_job_sources_note_idx').on(
            table.noteId,
            table.actorId,
        ),
    ],
);
