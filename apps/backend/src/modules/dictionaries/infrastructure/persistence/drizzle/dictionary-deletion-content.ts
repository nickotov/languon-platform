import { inArray, or, type SQL } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import type { DictionaryOperationContext } from '../../../application/ports/dictionary-store';
import { DictionaryDeletionBusyError } from '../../../application/dictionary-errors';
import {
    conversationDeletionBusy,
    eraseConversationContent,
} from '../../../../conversations/infrastructure/persistence/drizzle/conversation-deletion-participant';
import {
    sentenceDeletionBusy,
    eraseSentenceDerivedContent,
} from '../../../../learning/infrastructure/persistence/drizzle/sentence-deletion-participant';
import {
    dictionaryGenerationJobsTable,
    dictionaryCardRevisionsTable,
    dictionaryGenerationProposalsTable,
    dictionaryDocumentUploadsTable,
    dictionaryGenerationProviderUsageArchiveTable,
    dictionaryDocumentExtractionsTable,
    dictionaryDocumentObjectVersionsTable,
} from './schema';
type DictionaryDatabase = PostgresJsDatabase<typeof databaseSchema>;
type DictionaryTransaction = Parameters<
    Parameters<DictionaryDatabase['transaction']>[0]
>[0];

export async function deleteDictionaryContent(
    tx: DictionaryTransaction,
    input: {
        context: DictionaryOperationContext;
        ownerId: string;
    },
    dictionaryIds: readonly string[],
    cardIds: readonly string[] | null,
): Promise<void> {
    input.context.signal.throwIfAborted();
    if (!cardIds) {
        const scope = {
            sourceKind: 'dictionary' as const,
            sourceIds: dictionaryIds,
        };

        if (await conversationDeletionBusy(tx, scope, input.context.now))
            throw new DictionaryDeletionBusyError();
        await eraseConversationContent(tx, scope, input.context.now);
    }

    const sentenceScope = cardIds ? { entryIds: cardIds } : { dictionaryIds };
    if (await sentenceDeletionBusy(tx, sentenceScope))
        throw new DictionaryDeletionBusyError();
    await eraseSentenceDerivedContent(tx, {
        ...sentenceScope,
        now: input.context.now,
    });

    const directJobCondition = cardIds
        ? inArray(dictionaryGenerationJobsTable.cardId, [...cardIds])
        : inArray(dictionaryGenerationJobsTable.dictionaryId, [
              ...dictionaryIds,
          ]);
    const directJobs = await tx
        .select()
        .from(dictionaryGenerationJobsTable)
        .where(directJobCondition)
        .for('update');
    const relatedJobIds = new Set(directJobs.map((job) => job.id));
    if (cardIds) {
        const revisionJobs = await tx
            .select({
                id: dictionaryCardRevisionsTable.acceptedGenerationJobId,
            })
            .from(dictionaryCardRevisionsTable)
            .where(inArray(dictionaryCardRevisionsTable.cardId, [...cardIds]));
        const proposalJobs = await tx
            .select({ id: dictionaryGenerationProposalsTable.jobId })
            .from(dictionaryGenerationProposalsTable)
            .where(
                inArray(dictionaryGenerationProposalsTable.acceptedCardId, [
                    ...cardIds,
                ]),
            );

        for (const row of [...revisionJobs, ...proposalJobs])
            if (row.id) relatedJobIds.add(row.id);
    }

    const jobs =
        relatedJobIds.size === 0
            ? []
            : await tx
                  .select()
                  .from(dictionaryGenerationJobsTable)
                  .where(
                      inArray(dictionaryGenerationJobsTable.id, [
                          ...relatedJobIds,
                      ]),
                  )
                  .for('update');

    if (
        jobs.some(
            (job) =>
                job.executionState === 'queued' ||
                job.executionState === 'running' ||
                job.providerReservationState === 'active',
        )
    )
        throw new DictionaryDeletionBusyError();
    const jobIds = directJobs.map((job) => job.id);
    const contentJobIds = [...relatedJobIds];
    if (contentJobIds.length > 0) {
        const uploads = await tx
            .select()
            .from(dictionaryDocumentUploadsTable)
            .where(inArray(dictionaryDocumentUploadsTable.jobId, contentJobIds))
            .for('update');

        if (
            uploads.some(
                (upload) =>
                    upload.cleanupState !== 'complete' ||
                    upload.dataVersionsDeletedAt === null ||
                    upload.quotaReleasedAt === null,
            )
        )
            throw new DictionaryDeletionBusyError();
    }

    const settledJobs = directJobs.filter(
        (job) =>
            job.providerReservationState === 'settled' &&
            job.providerReservationSettledAt !== null &&
            job.providerActualCostMicros !== null &&
            job.providerActualInputTokens !== null &&
            job.providerActualOutputTokens !== null,
    );

    if (settledJobs.length > 0)
        await tx
            .insert(dictionaryGenerationProviderUsageArchiveTable)
            .values(
                settledJobs.map((job) => ({
                    actualCostMicros: job.providerActualCostMicros!,
                    actualInputTokens: job.providerActualInputTokens!,
                    actualOutputTokens: job.providerActualOutputTokens!,
                    archivedAt: input.context.now,
                    id: job.id,
                    inputCostMicrosPerMillionTokens:
                        job.providerInputCostMicrosPerMillionTokens,
                    maxCostMicrosPerAttempt:
                        job.providerMaxCostMicrosPerAttempt,
                    maxInputTokensPerAttempt:
                        job.providerMaxInputTokensPerAttempt,
                    maxOutputTokensPerAttempt:
                        job.providerMaxOutputTokensPerAttempt,
                    outputCostMicrosPerMillionTokens:
                        job.providerOutputCostMicrosPerMillionTokens,
                    ownerId: job.ownerId,
                    settledAt: job.providerReservationSettledAt!,
                })),
            )
            .onConflictDoNothing();

    if (contentJobIds.length > 0) {
        const uploadIds = await tx
            .select({ id: dictionaryDocumentUploadsTable.id })
            .from(dictionaryDocumentUploadsTable)
            .where(
                inArray(dictionaryDocumentUploadsTable.jobId, contentJobIds),
            );

        if (uploadIds.length > 0) {
            const ids = uploadIds.map((upload) => upload.id);
            await tx
                .delete(dictionaryDocumentExtractionsTable)
                .where(
                    inArray(dictionaryDocumentExtractionsTable.uploadId, ids),
                );

            await tx
                .delete(dictionaryDocumentObjectVersionsTable)
                .where(
                    inArray(
                        dictionaryDocumentObjectVersionsTable.uploadId,
                        ids,
                    ),
                );

            await tx
                .delete(dictionaryDocumentUploadsTable)
                .where(inArray(dictionaryDocumentUploadsTable.id, ids));
        }
    }

    const proposalConditions: SQL[] = [];
    if (contentJobIds.length > 0)
        proposalConditions.push(
            inArray(dictionaryGenerationProposalsTable.jobId, contentJobIds),
        );
    if (cardIds && cardIds.length > 0)
        proposalConditions.push(
            inArray(dictionaryGenerationProposalsTable.acceptedCardId, [
                ...cardIds,
            ]),
        );
    if (proposalConditions.length > 0)
        await tx
            .delete(dictionaryGenerationProposalsTable)
            .where(or(...proposalConditions));
    if (cardIds)
        await tx
            .delete(dictionaryCardRevisionsTable)
            .where(inArray(dictionaryCardRevisionsTable.cardId, [...cardIds]));
    else
        await tx
            .delete(dictionaryCardRevisionsTable)
            .where(
                inArray(dictionaryCardRevisionsTable.dictionaryId, [
                    ...dictionaryIds,
                ]),
            );
    if (jobIds.length > 0)
        await tx
            .delete(dictionaryGenerationJobsTable)
            .where(inArray(dictionaryGenerationJobsTable.id, jobIds));
    const retainedRelatedJobIds = [...relatedJobIds].filter(
        (id) => !jobIds.includes(id),
    );

    if (retainedRelatedJobIds.length > 0)
        await tx
            .update(dictionaryGenerationJobsTable)
            .set({
                inputPayload: null,
                updatedAt: input.context.now,
            })
            .where(
                inArray(
                    dictionaryGenerationJobsTable.id,
                    retainedRelatedJobIds,
                ),
            );
}
