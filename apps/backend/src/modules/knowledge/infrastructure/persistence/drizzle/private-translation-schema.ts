import { sql } from 'drizzle-orm';
import {
    check,
    index,
    jsonb,
    pgTable,
    primaryKey,
    text,
    timestamp,
    uuid,
} from 'drizzle-orm/pg-core';
import type { KnowledgeLearningSourceBinding } from '../../../application/learning-source-binding';
import { knowledgeNotesTable } from './schema';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import { textsAiJobsTable } from '../../../../texts/infrastructure/persistence/drizzle/texts-job-schema';

export const knowledgeTextJobSourcesTable = pgTable(
    'knowledge_text_job_sources',
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
        blockId: uuid('block_id').notNull(),
        requestedTargetLanguage: text('requested_target_language'),
        binding: jsonb('binding')
            .$type<KnowledgeLearningSourceBinding>()
            .notNull(),
    },
    (t) => [
        index('knowledge_text_job_sources_note_idx').on(t.noteId, t.actorId),
        check(
            'knowledge_text_job_sources_binding',
            sql`${t.binding}->>'kind'='knowledge-block' and ${t.binding}->>'actorId'=${t.actorId}::text and ${t.binding}->>'noteId'=${t.noteId}::text and ${t.binding}->>'blockId'=${t.blockId}::text and ${t.binding}->'sourceSnapshot'->>'type'='bilingual-text'`,
        ),
    ],
);
export const knowledgePrivateTranslationsTable = pgTable(
    'knowledge_private_translations',
    {
        actorId: uuid('actor_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        noteId: uuid('note_id')
            .notNull()
            .references(() => knowledgeNotesTable.id, { onDelete: 'cascade' }),
        blockId: uuid('block_id').notNull(),
        sourceFingerprint: text('source_fingerprint').notNull(),
        targetLanguage: text('target_language').notNull(),
        segments: jsonb('segments')
            .$type<{ sourceSegmentId: string; text: string }[]>()
            .notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    },
    (t) => [
        primaryKey({
            columns: [t.actorId, t.noteId, t.blockId, t.targetLanguage],
        }),
        check(
            'knowledge_private_translation_fingerprint',
            sql`${t.sourceFingerprint} ~ '^[a-f0-9]{64}$'`,
        ),
        check(
            'knowledge_private_translation_segments',
            sql`jsonb_typeof(${t.segments})='array' and jsonb_array_length(${t.segments}) between 1 and 500`,
        ),
    ],
);
