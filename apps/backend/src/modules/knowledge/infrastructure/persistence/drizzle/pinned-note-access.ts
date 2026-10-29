import { and, eq, isNull } from 'drizzle-orm';
import type { LearnerSourceAccess } from '../../../application/learner-store';
import type { KnowledgeLearningSourceBinding } from '../../../application/learning-source-binding';
import type { KnowledgeShareCrypto } from '../../knowledge-share-crypto';
import { knowledgeNotesTable, knowledgeSharesTable } from './schema';
import {
    knowledgeWorkbooksTable,
    knowledgeWorkbookNotesTable,
    knowledgeWorkbookSharesTable,
} from './workbook-schema';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import { readLearnerNote } from './learner-access';
import {
    knowledgeUnavailable,
    type KnowledgeTransaction,
} from './knowledge-transaction';

export type PinnedKnowledgeNoteSource = Pick<
    KnowledgeLearningSourceBinding,
    'actorId' | 'noteId' | 'noteOwnerId' | 'grant'
>;

/** Pin verified grant digests only; never retain a caller's raw shared-link key. */
export async function pinKnowledgeNoteSource(
    tx: KnowledgeTransaction,
    crypto: KnowledgeShareCrypto,
    actorId: string,
    noteId: string,
    access?: LearnerSourceAccess,
) {
    const note = await readLearnerNote(tx, crypto, actorId, noteId, access);
    let grant: KnowledgeLearningSourceBinding['grant'] = null;
    if (note.ownerId !== actorId || access?.kind === 'workbook') {
        if (!access) throw knowledgeUnavailable();
        if (access.kind === 'workbook') {
            const [share] = await tx
                .select()
                .from(knowledgeWorkbookSharesTable)
                .where(eq(knowledgeWorkbookSharesTable.locator, access.locator))
                .for('share');

            if (!share || !crypto.verify(access.key, share.keyDigest))
                throw knowledgeUnavailable();
            grant = {
                kind: 'workbook',
                locator: share.locator,
                digest: share.keyDigest,
                version: null,
                workbookId: share.workbookId,
            };
        } else {
            const [share] = await tx
                .select()
                .from(knowledgeSharesTable)
                .where(
                    and(
                        eq(knowledgeSharesTable.noteId, noteId),
                        eq(knowledgeSharesTable.locator, access.locator),
                    ),
                )
                .for('share');

            if (!share || !crypto.verify(access.key, share.keyDigest))
                throw knowledgeUnavailable();
            grant = {
                kind: 'note',
                locator: share.locator,
                digest: share.keyDigest,
                version: share.version,
                workbookId: null,
            };
        }
    }

    return { note, grant };
}

/** Re-read active actor/author, current note and exact live source grant under transaction locks. */
export async function readPinnedKnowledgeNoteSource(
    tx: KnowledgeTransaction,
    binding: PinnedKnowledgeNoteSource,
) {
    const [actor] = await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(
            and(
                eq(usersTable.id, binding.actorId),
                eq(usersTable.status, 'active'),
            ),
        )
        .for('share');

    if (!actor) throw knowledgeUnavailable();
    if (binding.grant?.kind === 'workbook') {
        const [workbook] = await tx
            .select()
            .from(knowledgeWorkbooksTable)
            .where(
                and(
                    eq(knowledgeWorkbooksTable.id, binding.grant.workbookId!),
                    eq(knowledgeWorkbooksTable.ownerId, binding.noteOwnerId),
                    isNull(knowledgeWorkbooksTable.deletedAt),
                ),
            )
            .for('share');

        if (!workbook) throw knowledgeUnavailable();
        const [share] = await tx
            .select()
            .from(knowledgeWorkbookSharesTable)
            .where(
                and(
                    eq(knowledgeWorkbookSharesTable.workbookId, workbook.id),
                    eq(
                        knowledgeWorkbookSharesTable.locator,
                        binding.grant.locator,
                    ),
                    eq(
                        knowledgeWorkbookSharesTable.keyDigest,
                        binding.grant.digest,
                    ),
                ),
            )
            .for('share');
        const [member] = await tx
            .select()
            .from(knowledgeWorkbookNotesTable)
            .where(
                and(
                    eq(knowledgeWorkbookNotesTable.workbookId, workbook.id),
                    eq(knowledgeWorkbookNotesTable.noteId, binding.noteId),
                ),
            );

        if (!share || !member) throw knowledgeUnavailable();
    }

    const [note] = await tx
        .select()
        .from(knowledgeNotesTable)
        .where(
            and(
                eq(knowledgeNotesTable.id, binding.noteId),
                eq(knowledgeNotesTable.ownerId, binding.noteOwnerId),
                eq(knowledgeNotesTable.status, 'saved'),
            ),
        )
        .for('share');

    if (!note) throw knowledgeUnavailable();
    const [owner] = await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(
            and(
                eq(usersTable.id, note.ownerId),
                eq(usersTable.status, 'active'),
            ),
        );

    if (!owner) throw knowledgeUnavailable();
    if (binding.grant?.kind === 'note') {
        const [share] = await tx
            .select()
            .from(knowledgeSharesTable)
            .where(
                and(
                    eq(knowledgeSharesTable.noteId, note.id),
                    eq(knowledgeSharesTable.locator, binding.grant.locator),
                    eq(knowledgeSharesTable.keyDigest, binding.grant.digest),
                    eq(knowledgeSharesTable.version, binding.grant.version!),
                ),
            )
            .for('share');

        if (!share) throw knowledgeUnavailable();
    } else if (!binding.grant && binding.actorId !== note.ownerId)
        throw knowledgeUnavailable();

    return { note };
}
