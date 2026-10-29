import { and, eq } from 'drizzle-orm';
import type { SpeechSource } from '@languon/contracts';
import { knowledgeWorkingBranchesTable } from '../../knowledge/infrastructure/persistence/drizzle/schema';
import { getOwnedKnowledgeRow } from '../../knowledge/infrastructure/persistence/drizzle/knowledge-transaction';
import { knowledgeNarrationText } from '../domain/knowledge-speech-text';
import { SpeechError } from '../domain/speech-policy';
import type { SpeechSourceTransaction } from './source-resolver';
import type { ResolvedSpeechSource } from '../application/ports';

export async function resolveKnowledgeSpeechSource(
    tx: SpeechSourceTransaction,
    actorId: string,
    source: Extract<SpeechSource, { kind: 'knowledge-block' }>,
): Promise<
    ResolvedSpeechSource & {
        authority: Extract<SpeechSource, { kind: 'knowledge-block' }>;
    }
> {
    const note = await getOwnedKnowledgeRow(tx, actorId, source.noteId).catch(
        () => {
            throw new SpeechError('speech_source_unavailable', 404);
        },
    );
    const [branch] = await tx
        .select()
        .from(knowledgeWorkingBranchesTable)
        .where(
            and(
                eq(knowledgeWorkingBranchesTable.id, source.branchId),
                eq(knowledgeWorkingBranchesTable.noteId, note.id),
            ),
        )
        .for('share');
    if (!branch || branch.version !== source.expectedBranchVersion)
        throw new SpeechError('speech_source_changed');
    const block = branch.content.body.document.content?.find(
        (node) =>
            node.type === 'learningBlock' &&
            node.attrs?.block?.id === source.blockId,
    )?.attrs?.block;
    if (!block || ['video', 'exercise'].includes(block.type))
        throw new SpeechError('speech_source_unavailable', 404);
    const { text, language } = knowledgeNarrationText(
        block,
        branch.content.studiedLanguage,
        branch.content.explanationLanguage,
    );
    return {
        text,
        language,
        revision: `${note.id}:${branch.id}:${branch.version}:${block.id}`,
        authority: source,
        privateKnowledgeSource: { noteId: note.id, ownerId: actorId },
    };
}
