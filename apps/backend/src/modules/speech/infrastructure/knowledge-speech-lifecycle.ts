import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import type { KnowledgeTransaction } from '../../knowledge/infrastructure/persistence/drizzle/knowledge-transaction';
import { KnowledgeDomainError } from '../../knowledge/domain/knowledge';
import { knowledgeSpeechRecordingsTable as owned } from './knowledge-speech-schema';
import {
    speechRecordingsTable as recordings,
    speechJobsTable as jobs,
    speechBindingsTable as bindings,
    speechQuotesTable as quotes,
} from './schema';

/** Private narration never inherits globally retained dictionary pronunciation lifetime. */
export async function eraseKnowledgeSpeech(
    tx: KnowledgeTransaction,
    noteId: string,
) {
    const ids = (
        await tx
            .select({ id: owned.recordingId })
            .from(owned)
            .where(eq(owned.noteId, noteId))
    ).map((r) => r.id);
    await tx
        .delete(quotes)
        .where(
            sql`${quotes.source}->>'kind' in ('knowledge-block','knowledge-snippet','knowledge-audio-draft') and ${quotes.source}->>'noteId'=${noteId}`,
        );
    if (!ids.length) return;
    const [active] = await tx
        .select({ id: jobs.id })
        .from(jobs)
        .where(
            and(
                inArray(jobs.recordingId, ids),
                notInArray(jobs.state, ['ready', 'failed']),
            ),
        )
        .limit(1)
        .for('share');
    if (active)
        throw new KnowledgeDomainError(
            'deletion_busy',
            'Wait for this note’s audio generation to finish before deleting it.',
        );
    await tx
        .update(recordings)
        .set({
            text: '',
            state: 'deleting',
            deletedAt: new Date(),
            version: sql`${recordings.version}+1`,
        })
        .where(inArray(recordings.id, ids));
    await tx.delete(bindings).where(inArray(bindings.recordingId, ids));
}
