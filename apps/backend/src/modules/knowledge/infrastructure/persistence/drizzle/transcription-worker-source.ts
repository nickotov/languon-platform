import { sql } from 'drizzle-orm';
import type { KnowledgeTransaction } from './knowledge-transaction';
import type { TranscriptionJobRow } from './transcription-context';
import { KnowledgeDomainError } from '../../../domain/knowledge';
import type { VerifiedKnowledgeAudio } from '../../../application/media-store';

/** Reads no unrelated media and requires the current worker fence in the database. */
export async function readTranscriptionWorkerAudio(
    tx: KnowledgeTransaction,
    row: Pick<
        TranscriptionJobRow,
        'id' | 'workerId' | 'fencingToken' | 'sourceDurationMs'
    >,
    leaseToken?: string,
): Promise<VerifiedKnowledgeAudio> {
    const rows = await tx.execute(
        leaseToken
            ? sql`select * from languon_read_transcription_audio_fenced(${row.id}::uuid,${row.workerId}::text,${row.fencingToken}::integer,${leaseToken}::uuid)`
            : sql`select * from languon_read_transcription_audio(${row.id}::uuid,${row.workerId}::text,${row.fencingToken}::integer)`,
    );
    const source = rows[0];
    if (
        !source ||
        !(source.bytes instanceof Uint8Array) ||
        (source.mime_type !== 'audio/wav' &&
            source.mime_type !== 'audio/mpeg') ||
        source.duration_ms !== row.sourceDurationMs
    )
        throw new KnowledgeDomainError(
            'knowledge_not_found',
            'The transcription audio source is unavailable.',
        );

    return {
        bytes: source.bytes,
        mimeType: source.mime_type,
        durationMs: source.duration_ms,
    };
}
