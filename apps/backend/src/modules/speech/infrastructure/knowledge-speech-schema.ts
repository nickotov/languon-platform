import { pgTable, uuid, index } from 'drizzle-orm/pg-core';
import { knowledgeNotesTable } from '../../knowledge/infrastructure/persistence/drizzle/schema';
import { speechRecordingsTable } from './schema';

/** Ownership marker is retained until note erasure has cleared private narration. */
export const knowledgeSpeechRecordingsTable = pgTable(
    'knowledge_speech_recordings',
    {
        recordingId: uuid('recording_id')
            .primaryKey()
            .references(() => speechRecordingsTable.id, {
                onDelete: 'cascade',
            }),
        noteId: uuid('note_id')
            .notNull()
            .references(() => knowledgeNotesTable.id, { onDelete: 'cascade' }),
    },
    (t) => [index('knowledge_speech_recordings_note_idx').on(t.noteId)],
);
