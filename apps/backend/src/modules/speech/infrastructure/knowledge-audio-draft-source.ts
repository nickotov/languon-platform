import { and, eq } from 'drizzle-orm';
import type { SpeechSource } from '@languon/contracts';
import { knowledgeWorkingBranchesTable as branches } from '../../knowledge/infrastructure/persistence/drizzle/schema';
import {
    getOwnedKnowledgeRow,
    knowledgeFingerprint,
} from '../../knowledge/infrastructure/persistence/drizzle/knowledge-transaction';
import type { SpeechSourceTransaction } from './source-resolver';
import { SpeechError } from '../domain/speech-policy';
import type { ResolvedSpeechSource } from '../application/ports';

/** Owner-only frozen dialog input. The block may not yet exist in the working document. */
export async function resolveKnowledgeAudioDraftSource(
    tx: SpeechSourceTransaction,
    actorId: string,
    source: Extract<SpeechSource, { kind: 'knowledge-audio-draft' }>,
): Promise<ResolvedSpeechSource & { authority: typeof source }> {
    const note = await getOwnedKnowledgeRow(tx, actorId, source.noteId).catch(
        () => {
            throw new SpeechError('speech_source_unavailable', 404);
        },
    );
    const [branch] = await tx
        .select({ id: branches.id })
        .from(branches)
        .where(
            and(eq(branches.id, source.branchId), eq(branches.noteId, note.id)),
        )
        .for('share');
    if (!branch) throw new SpeechError('speech_source_unavailable', 404);
    return {
        text: source.sourceText,
        language: source.language,
        revision: `${note.id}:audio-draft:${branch.id}:${source.blockId}:${knowledgeFingerprint({ text: source.sourceText, language: source.language })}`,
        authority: source,
        privateKnowledgeSource: { noteId: note.id, ownerId: note.ownerId },
    };
}
