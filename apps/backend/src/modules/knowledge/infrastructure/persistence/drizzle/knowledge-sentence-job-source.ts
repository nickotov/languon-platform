import { and, eq } from 'drizzle-orm';
import type { KnowledgeLearningSourceBinding } from '../../../application/learning-source-binding';
import type {
    SentenceGenerationInput,
    SentenceCheckInput,
} from '../../../../learning/domain/sentence-types';
import { SentenceUnavailableError } from '../../../../learning/domain/sentence-errors';
import type { KnowledgeTransaction } from './knowledge-transaction';
import { readPinnedKnowledgeLearningSource } from './learning-source-binding';
import { knowledgeSentenceJobSourcesTable as sources } from './knowledge-sentence-job-source-schema';

export async function attachKnowledgeSentenceJobSource(
    tx: KnowledgeTransaction,
    input: {
        jobId: string;
        actorId: string;
        binding: KnowledgeLearningSourceBinding;
        inputPayload: SentenceGenerationInput | SentenceCheckInput;
    },
) {
    if (
        input.actorId !== input.binding.actorId ||
        input.binding.sourceSnapshot.type !== 'vocabulary'
    )
        throw new SentenceUnavailableError();
    await readPinnedKnowledgeLearningSource(tx, input.binding);
    await tx.insert(sources).values({
        jobId: input.jobId,
        actorId: input.actorId,
        noteId: input.binding.noteId,
        blockId: input.binding.blockId,
        binding: input.binding,
        inputPayload: input.inputPayload,
        sourceExerciseId:
            'exerciseId' in input.inputPayload
                ? input.inputPayload.exerciseId
                : null,
    });
}

export async function readKnowledgeSentenceJobSource(
    tx: KnowledgeTransaction,
    input: { jobId: string; actorId: string; noteId: string; blockId: string },
) {
    const [source] = await tx
        .select()
        .from(sources)
        .where(
            and(
                eq(sources.jobId, input.jobId),
                eq(sources.actorId, input.actorId),
                eq(sources.noteId, input.noteId),
                eq(sources.blockId, input.blockId),
            ),
        )
        .for('share');

    if (!source) throw new SentenceUnavailableError();
    await readPinnedKnowledgeLearningSource(tx, source.binding);

    return source;
}
