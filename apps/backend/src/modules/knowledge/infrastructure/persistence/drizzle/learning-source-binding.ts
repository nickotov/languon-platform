import {
    pinKnowledgeNoteSource,
    readPinnedKnowledgeNoteSource,
} from './pinned-note-access';
import { readLearningEpochs, requireLearningEpoch } from './learning-epochs';
import { createHash } from 'node:crypto';
import { KnowledgeBodySchema, type LearningBlock } from '@languon/contracts';
import type { LearnerSourceAccess } from '../../../application/learner-store';
import type { KnowledgeLearningSourceBinding } from '../../../application/learning-source-binding';
import type { KnowledgeShareCrypto } from '../../knowledge-share-crypto';
import { KnowledgeDomainError } from '../../../domain/knowledge';
import type { knowledgeNotesTable } from './schema';
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
    const { note, grant } = await pinKnowledgeNoteSource(
        tx,
        crypto,
        actorId,
        noteId,
        access,
    );
    const block = blockFrom(note, blockId);
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
    const { note } = await readPinnedKnowledgeNoteSource(tx, binding);
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
