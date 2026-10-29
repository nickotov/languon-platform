import { and, eq } from 'drizzle-orm';
import type { KnowledgeFieldActionInput } from '../../../application/ports/block-field-action-store';
import { TextsAiError } from '../../../../texts/application/ports/texts-ai-provider';
import type { TextsTransaction } from '../../../../texts/infrastructure/persistence/drizzle/texts-job-support';
import { knowledgeFieldJobSourcesTable as sources } from './block-field-source-schema';
import {
    knowledgeNotesTable as notes,
    knowledgeWorkingBranchesTable as branches,
} from './schema';

/** Draft values need not have been saved, but the note and branch must belong to this author. */
export async function authorizeKnowledgeFieldDraft(
    tx: TextsTransaction,
    actorId: string,
    input: Pick<KnowledgeFieldActionInput, 'noteId' | 'branchId'>,
) {
    const [source] = await tx
        .select({ id: notes.id })
        .from(notes)
        .innerJoin(
            branches,
            and(eq(branches.noteId, notes.id), eq(branches.id, input.branchId)),
        )
        .where(and(eq(notes.id, input.noteId), eq(notes.ownerId, actorId)))
        .for('share');

    if (!source) throw new TextsAiError('access_revoked');
}

export async function authorizeKnowledgeFieldJobSource(
    tx: TextsTransaction,
    input: {
        ownerId: string;
        id?: string;
        externalSourceKind?: string | null;
        knowledgeFieldAction?: KnowledgeFieldActionInput;
    },
) {
    if (input.knowledgeFieldAction) {
        await authorizeKnowledgeFieldDraft(
            tx,
            input.ownerId,
            input.knowledgeFieldAction,
        );

        return;
    }

    if (input.externalSourceKind !== 'knowledge-field') return;
    if (!input.id) throw new TextsAiError('access_revoked');
    const [source] = await tx
        .select()
        .from(sources)
        .where(
            and(
                eq(sources.jobId, input.id),
                eq(sources.actorId, input.ownerId),
            ),
        );

    if (!source) throw new TextsAiError('access_revoked');
    await authorizeKnowledgeFieldDraft(tx, input.ownerId, source);
}
