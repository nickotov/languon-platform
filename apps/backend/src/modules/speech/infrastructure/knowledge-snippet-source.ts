import { isReadOnlyKnowledgeSource } from '../../conversations/domain/conversation';
import { and, eq, isNull } from 'drizzle-orm';
import { KnowledgeBodySchema, LearningBlockSchema } from '@languon/contracts';
import {
    knowledgeNotesTable as notes,
    knowledgeSharesTable as noteShares,
    knowledgeWorkingBranchesTable as branches,
} from '../../knowledge/infrastructure/persistence/drizzle/schema';
import {
    knowledgeWorkbooksTable as workbooks,
    knowledgeWorkbookNotesTable as members,
    knowledgeWorkbookSharesTable as workbookShares,
} from '../../knowledge/infrastructure/persistence/drizzle/workbook-schema';
import { usersTable as users } from '../../users/infrastructure/persistence/drizzle/schema';
import { conversationsTable as chats } from '../../conversations/infrastructure/persistence/drizzle/schema';
import { conversationBlockProposalsTable as proposals } from '../../conversations/infrastructure/persistence/drizzle/conversation-block-proposal-schema';
import {
    getOwnedKnowledgeRow,
    knowledgeFingerprint,
} from '../../knowledge/infrastructure/persistence/drizzle/knowledge-transaction';
import type { KnowledgeShareCrypto } from '../../knowledge/infrastructure/knowledge-share-crypto';
import type {
    KnowledgeSnippetSpeechSource,
    StoredKnowledgeSnippetSpeechSource,
    ResolvedSpeechSource,
} from '../application/ports';
import { SpeechError } from '../domain/speech-policy';
import { knowledgeSnippetText } from '../domain/knowledge-snippet-text';
import type { SpeechSourceTransaction } from './source-resolver';

type Source = KnowledgeSnippetSpeechSource | StoredKnowledgeSnippetSpeechSource;
const unavailable = () => new SpeechError('speech_source_unavailable', 404);

/** Every prepare/confirm/read re-resolves source authority under lifecycle locks. */
export async function resolveKnowledgeSnippetSource(
    tx: SpeechSourceTransaction,
    actorId: string,
    source: Source,
    crypto: KnowledgeShareCrypto,
): Promise<
    ResolvedSpeechSource & { authority: StoredKnowledgeSnippetSpeechSource }
> {
    const origin = source.origin;
    if (origin.kind === 'saved')
        return resolveSaved(tx, actorId, source, crypto);
    const note = await getOwnedKnowledgeRow(tx, actorId, source.noteId).catch(
        () => {
            throw unavailable();
        },
    );
    let block: unknown;
    let revision: string;
    if (origin.kind === 'working') {
        const [branch] = await tx
            .select()
            .from(branches)
            .where(
                and(
                    eq(branches.id, origin.branchId),
                    eq(branches.noteId, note.id),
                ),
            )
            .for('share');
        if (!branch || branch.version !== origin.expectedBranchVersion)
            throw new SpeechError('speech_source_changed');
        block = branch.content.body.document.content?.find(
            (node) => node.attrs?.block?.id === source.blockId,
        )?.attrs?.block;
        revision = `${note.id}:${branch.id}:${branch.version}:${source.blockId}`;
    } else {
        const [chat] = await tx
            .select()
            .from(chats)
            .where(
                and(
                    eq(chats.id, origin.conversationId),
                    eq(chats.ownerId, actorId),
                ),
            )
            .for('share');
        if (
            !chat ||
            chat.source.kind !== 'knowledge' ||
            chat.source.id !== note.id ||
            isReadOnlyKnowledgeSource(chat.source)
        )
            throw unavailable();
        const [proposal] = await tx
            .select()
            .from(proposals)
            .where(
                and(
                    eq(proposals.id, origin.proposalId),
                    eq(proposals.conversationId, chat.id),
                    eq(proposals.noteId, note.id),
                ),
            )
            .for('share');
        if (!proposal) throw unavailable();
        block = proposal.blocks.find((item) => item.id === source.blockId);
        revision = `${note.id}:proposal:${proposal.id}:${knowledgeFingerprint(block)}`;
    }
    const parsed = LearningBlockSchema.safeParse(block);
    if (!parsed.success) throw unavailable();
    return {
        ...knowledgeSnippetText(parsed.data, source.selector),
        revision: `${revision}:${knowledgeFingerprint(source.selector)}`,
        authority: source as StoredKnowledgeSnippetSpeechSource,
        privateKnowledgeSource: { noteId: note.id, ownerId: note.ownerId },
    };
}

async function resolveSaved(
    tx: SpeechSourceTransaction,
    actorId: string,
    source: Source,
    crypto: KnowledgeShareCrypto,
): Promise<
    ResolvedSpeechSource & { authority: StoredKnowledgeSnippetSpeechSource }
> {
    const origin = source.origin;
    if (origin.kind !== 'saved') throw unavailable();
    const [actor] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, actorId), eq(users.status, 'active')))
        .for('share');
    if (!actor) throw unavailable();
    const access = origin.access;
    const keyDigest =
        access &&
        ('key' in access ? crypto.digest(access.key) : access.keyDigest);
    let workbookOwner: string | undefined;
    if (access?.kind === 'workbook') {
        if (!keyDigest) throw unavailable();
        // Match the existing workbook lifecycle lock order: workbook, live share, note.
        const [candidate] = await tx
            .select({ workbookId: workbookShares.workbookId })
            .from(workbookShares)
            .where(
                and(
                    eq(workbookShares.locator, access.locator),
                    eq(workbookShares.keyDigest, keyDigest),
                ),
            );
        if (!candidate) throw unavailable();
        const [workbook] = await tx
            .select({ ownerId: workbooks.ownerId })
            .from(workbooks)
            .where(
                and(
                    eq(workbooks.id, candidate.workbookId),
                    isNull(workbooks.deletedAt),
                ),
            )
            .for('share');
        if (!workbook) throw unavailable();
        const [live] = await tx
            .select({ workbookId: workbookShares.workbookId })
            .from(workbookShares)
            .where(
                and(
                    eq(workbookShares.workbookId, candidate.workbookId),
                    eq(workbookShares.locator, access.locator),
                    eq(workbookShares.keyDigest, keyDigest),
                ),
            )
            .for('share');
        const [member] = await tx
            .select({ noteId: members.noteId })
            .from(members)
            .where(
                and(
                    eq(members.workbookId, candidate.workbookId),
                    eq(members.noteId, source.noteId),
                ),
            );
        if (!live || !member) throw unavailable();
        workbookOwner = workbook.ownerId;
    }
    const [note] = await tx
        .select()
        .from(notes)
        .where(and(eq(notes.id, source.noteId), eq(notes.status, 'saved')))
        .for('share');
    if (!note || (workbookOwner && workbookOwner !== note.ownerId))
        throw unavailable();
    const [owner] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, note.ownerId), eq(users.status, 'active')));
    if (!owner) throw unavailable();
    if (access?.kind === 'note') {
        if (!keyDigest) throw unavailable();
        const [share] = await tx
            .select({ id: noteShares.noteId })
            .from(noteShares)
            .where(
                and(
                    eq(noteShares.noteId, note.id),
                    eq(noteShares.locator, access.locator),
                    eq(noteShares.keyDigest, keyDigest),
                ),
            )
            .for('share');
        if (!share) throw unavailable();
    } else if (!access && note.ownerId !== actorId) throw unavailable();
    if (note.version !== origin.expectedNoteVersion)
        throw new SpeechError('speech_source_changed');
    const block = KnowledgeBodySchema.parse(note.body).document.content?.find(
        (node) => node.attrs?.block?.id === source.blockId,
    )?.attrs?.block;
    if (!block) throw unavailable();
    const authority: StoredKnowledgeSnippetSpeechSource = {
        ...source,
        origin: {
            kind: 'saved',
            expectedNoteVersion: origin.expectedNoteVersion,
            ...(access && keyDigest
                ? {
                      access: {
                          kind: access.kind,
                          locator: access.locator,
                          keyDigest,
                      },
                  }
                : {}),
        },
    };
    return {
        ...knowledgeSnippetText(block, source.selector),
        revision: `${note.id}:saved:${note.version}:${block.id}:${knowledgeFingerprint(source.selector)}`,
        authority,
        privateKnowledgeSource: { noteId: note.id, ownerId: note.ownerId },
    };
}
