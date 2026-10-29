import { readLearningEpochs, requireLearningEpoch } from './learning-epochs';
import { createHash } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { KnowledgeBodySchema, type LearningBlock } from '@languon/contracts';
import type { LearnerSourceAccess } from '../../../application/learner-store';
import type { KnowledgeLearningSourceBinding } from '../../../application/learning-source-binding';
import type { KnowledgeShareCrypto } from '../../knowledge-share-crypto';
import { KnowledgeDomainError } from '../../../domain/knowledge';
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

type SupportedBlock = Extract<
    LearningBlock,
    { type: 'bilingual-text' | 'vocabulary' }
>;
export function knowledgeLearningSourceSnapshot(
    block: SupportedBlock,
): KnowledgeLearningSourceBinding['sourceSnapshot'] {
    return block.type === 'bilingual-text'
        ? {
              type: block.type,
              language: block.language,
              segments: block.segments,
          }
        : {
              type: block.type,
              language: block.language,
              translationLanguage: block.translationLanguage,
              entries: block.entries,
          };
}

export function knowledgeLearningSourceFingerprint(
    snapshot: KnowledgeLearningSourceBinding['sourceSnapshot'],
) {
    return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

function blockFrom(
    note: typeof knowledgeNotesTable.$inferSelect,
    id: string,
): SupportedBlock {
    const block = KnowledgeBodySchema.parse(note.body)
        .document.content?.map((node) => node.attrs?.block)
        .find((candidate) => candidate?.id === id);

    if (
        !block ||
        (block.type !== 'bilingual-text' && block.type !== 'vocabulary')
    )
        throw knowledgeUnavailable();

    return block;
}

/** Pin only verified digests; raw share keys never enter job input or private overlays. */
export async function pinKnowledgeLearningSource(
    tx: KnowledgeTransaction,
    crypto: KnowledgeShareCrypto,
    actorId: string,
    noteId: string,
    blockId: string,
    access?: LearnerSourceAccess,
) {
    const note = await readLearnerNote(tx, crypto, actorId, noteId, access);
    const block = blockFrom(note, blockId);
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

    const sourceSnapshot = knowledgeLearningSourceSnapshot(block);
    const epochs =
        block.type === 'vocabulary'
            ? await readLearningEpochs(tx, noteId)
            : undefined;
    const learningVersions =
        block.type === 'vocabulary' && epochs
            ? block.entries.map((entry) => ({
                  entryId: entry.id,
                  epoch: requireLearningEpoch(
                      epochs,
                      'vocabulary',
                      block.id,
                      entry.id,
                  ).epoch,
              }))
            : undefined;

    return {
        note,
        block,
        binding: {
            kind: 'knowledge-block',
            actorId,
            noteId,
            noteOwnerId: note.ownerId,
            blockId,
            sourceFingerprint:
                knowledgeLearningSourceFingerprint(sourceSnapshot),
            sourceSnapshot,
            ...(learningVersions ? { learningVersions } : {}),
            grant,
        } satisfies KnowledgeLearningSourceBinding,
    };
}

/** Rechecked in admission, claims, reads and publication; this does not grant any editing rights. */
export async function readPinnedKnowledgeLearningSource(
    tx: KnowledgeTransaction,
    binding: KnowledgeLearningSourceBinding,
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
    const block = blockFrom(note, binding.blockId);
    if (
        knowledgeLearningSourceFingerprint(
            knowledgeLearningSourceSnapshot(block),
        ) !== binding.sourceFingerprint
    )
        throw new KnowledgeDomainError(
            'version_conflict',
            'The learning material changed. Start a new action.',
        );

    if (block.type === 'vocabulary') {
        const epochs = await readLearningEpochs(tx, note.id);
        if (
            !binding.learningVersions ||
            binding.learningVersions.length !== block.entries.length ||
            block.entries.some(
                (entry) =>
                    binding.learningVersions?.find(
                        (item) => item.entryId === entry.id,
                    )?.epoch !==
                    requireLearningEpoch(
                        epochs,
                        'vocabulary',
                        block.id,
                        entry.id,
                    ).epoch,
            )
        )
            throw new KnowledgeDomainError(
                'version_conflict',
                'The vocabulary learning version changed. Start a new action.',
            );
    }

    return { note, block };
}
