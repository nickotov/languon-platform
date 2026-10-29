import { authorizeKnowledgeExerciseJobSource } from '../../../../knowledge/infrastructure/persistence/drizzle/exercise-evaluation-source';
import type { KnowledgeExerciseEvaluationInput } from '../../../../knowledge/application/ports/exercise-evaluation-store';
import { authorizeKnowledgeFieldJobSource } from '../../../../knowledge/infrastructure/persistence/drizzle/block-field-source';
import type { KnowledgeFieldActionInput } from '../../../../knowledge/application/ports/block-field-action-store';
import type { KnowledgeLearningSourceBinding } from '../../../../knowledge/application/learning-source-binding';
import {
    authorizeKnowledgeTranslationJobSource,
    readPrivateKnowledgeTranslationResult,
} from '../../../../knowledge/infrastructure/persistence/drizzle/private-translation-persistence';
import { KnowledgeDomainError } from '../../../../knowledge/domain/knowledge';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import { and, eq, isNull } from 'drizzle-orm';
import {
    TextAiJobSchema,
    TextTranslationProposalSchema,
} from '@languon/contracts';
import { textsAiJobsTable as jobs } from './texts-job-schema';
import { textFoldersTable as folders, textsTable as texts } from './schema';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import { TextsAiError } from '../../../application/ports/texts-ai-provider';
export type TextsDatabase = PostgresJsDatabase<typeof databaseSchema>;
export type TextsTransaction = Parameters<
    Parameters<TextsDatabase['transaction']>[0]
>[0];
export type TextsJobRow = typeof jobs.$inferSelect;
export function exposeTextsJob(job: TextsJobRow) {
    return TextAiJobSchema.parse({
        id: job.id,
        kind: job.jobKind,
        state:
            job.executionState === 'completed' && job.cancellationRequestedAt
                ? 'cancelled'
                : job.executionState,
        failureCode:
            job.failureCategory === 'explicit_stop'
                ? null
                : job.failureCategory,
        result: job.resultPayload,
        createdAt: job.createdAt.toISOString(),
        completedAt: job.completedAt?.toISOString() ?? null,
    });
}

export async function exposeOwnedTextsJob(
    tx: TextsTransaction,
    job: TextsJobRow,
) {
    if (
        job.externalSourceKind === 'knowledge-block' &&
        job.executionState === 'completed' &&
        !job.cancellationRequestedAt &&
        job.resultPayload === null
    ) {
        return exposeTextsJob({
            ...job,
            resultPayload: await readPrivateKnowledgeTranslationResult(
                tx,
                job.id,
                job.ownerId,
            ),
        });
    }

    return exposeTextsJob(job);
}

export async function authorizeTextsJob(
    tx: TextsTransaction,
    input: {
        ownerId: string;
        id?: string;
        externalSourceKind?:
            'knowledge-block' | 'knowledge-field' | 'knowledge-exercise' | null;
        knowledgeFieldAction?: KnowledgeFieldActionInput;
        knowledgeExerciseEvaluation?: KnowledgeExerciseEvaluationInput;
        knowledgeSource?: KnowledgeLearningSourceBinding;
        folderId: string | null;
        textId?: string | null | undefined;
        expectedTextVersion?: number | null | undefined;
    },
) {
    const [owner] = await tx
        .select({ status: usersTable.status })
        .from(usersTable)
        .where(eq(usersTable.id, input.ownerId))
        .for('share');

    if (!owner || owner.status !== 'active')
        throw new TextsAiError('access_revoked');
    try {
        await authorizeKnowledgeFieldJobSource(tx, input);
        await authorizeKnowledgeExerciseJobSource(tx, input);
        if (
            input.externalSourceKind !== 'knowledge-field' &&
            input.externalSourceKind !== 'knowledge-exercise'
        )
            await authorizeKnowledgeTranslationJobSource(tx, {
                ...input,
                externalSourceKind: input.externalSourceKind ?? null,
            });
    } catch (error) {
        if (error instanceof KnowledgeDomainError)
            throw new TextsAiError(
                error.code === 'version_conflict'
                    ? 'version_conflict'
                    : 'access_revoked',
            );

        throw error;
    }

    const [folder] = input.folderId
        ? await tx
              .select()
              .from(folders)
              .where(
                  and(
                      eq(folders.id, input.folderId),
                      eq(folders.ownerId, input.ownerId),
                  ),
              )
              .for('share')
        : [];

    if (input.folderId && (!folder || folder.lifecycle !== 'active'))
        throw new TextsAiError('folder_not_found');
    if (input.textId) {
        const [text] = await tx
            .select()
            .from(texts)
            .where(
                and(
                    eq(texts.id, input.textId),
                    eq(texts.ownerId, input.ownerId),
                    input.folderId === null
                        ? isNull(texts.folderId)
                        : eq(texts.folderId, input.folderId),
                ),
            )
            .for('share');

        if (!text || text.lifecycle !== 'active')
            throw new TextsAiError('text_not_found');
        if (text.version !== input.expectedTextVersion)
            throw new TextsAiError('version_conflict');
    }
}

export async function loadTextTranslationProposal(
    tx: TextsTransaction,
    input: {
        ownerId: string;
        jobId: string;
        textId: string;
        expectedVersion: number;
        folderId?: string | null;
        now?: Date;
    },
) {
    const [job] = await tx
        .select()
        .from(jobs)
        .where(and(eq(jobs.id, input.jobId), eq(jobs.ownerId, input.ownerId)))
        .for('update');

    if (!job) throw new TextsAiError('generation_job_not_found');
    await authorizeTextsJob(tx, job);
    if (job.expiresAt <= (input.now ?? new Date()))
        throw new TextsAiError('generation_proposal_expired');
    if (
        job.executionState !== 'completed' ||
        !!job.cancellationRequestedAt ||
        job.jobKind !== 'text-translation' ||
        job.format === 'text-translation:v4' ||
        (!job.resultPayload && job.externalSourceKind !== 'knowledge-block')
    )
        throw new TextsAiError('generation_not_reviewable');
    if (input.folderId !== undefined && input.folderId !== job.folderId)
        throw new TextsAiError('version_conflict');
    if (
        job.textId &&
        (job.textId !== input.textId ||
            job.expectedTextVersion !== input.expectedVersion)
    )
        throw new TextsAiError('version_conflict');
    if (job.appliedTextId) throw new TextsAiError('generation_not_reviewable');
    const proposal = TextTranslationProposalSchema.parse(
        job.externalSourceKind === 'knowledge-block' &&
            job.resultPayload === null
            ? await readPrivateKnowledgeTranslationResult(
                  tx,
                  job.id,
                  job.ownerId,
              )
            : job.resultPayload,
    );

    await tx
        .update(jobs)
        .set({ appliedTextId: input.textId })
        .where(eq(jobs.id, job.id));

    return proposal;
}

/** Read-only proposal authority seam for dictionary selection; call again before commit. */
export async function resolveTextTranslationProposal(
    tx: TextsTransaction,
    input: { ownerId: string; jobId: string; now: Date },
) {
    const [candidate] = await tx
        .select()
        .from(jobs)
        .where(and(eq(jobs.id, input.jobId), eq(jobs.ownerId, input.ownerId)));

    if (!candidate) throw new TextsAiError('generation_job_not_found');
    await authorizeTextsJob(tx, candidate);
    const [job] = await tx
        .select()
        .from(jobs)
        .where(eq(jobs.id, input.jobId))
        .for('share');

    if (!job || job.expiresAt <= input.now)
        throw new TextsAiError('generation_proposal_expired');
    if (
        job.executionState !== 'completed' ||
        !!job.cancellationRequestedAt ||
        job.jobKind !== 'text-translation' ||
        job.format === 'text-translation:v4' ||
        (!job.resultPayload && job.externalSourceKind !== 'knowledge-block') ||
        job.appliedTextId
    )
        throw new TextsAiError('generation_not_reviewable');

    return TextTranslationProposalSchema.parse(
        job.externalSourceKind === 'knowledge-block' &&
            job.resultPayload === null
            ? await readPrivateKnowledgeTranslationResult(
                  tx,
                  job.id,
                  job.ownerId,
              )
            : job.resultPayload,
    );
}
