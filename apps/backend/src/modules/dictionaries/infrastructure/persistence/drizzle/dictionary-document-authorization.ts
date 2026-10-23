import { and, count, eq, sql } from 'drizzle-orm';
import { AiCreditInsufficientBalanceError } from '../../../../ai-credits/domain/ai-credit';
import { DrizzleAiCreditTransactionParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import {
    reserveLegacyAction,
    usesLegacyAction,
} from '../../../../ai-credits/infrastructure/persistence/drizzle/legacy-action-accounting';
import { modelPricingTransaction } from '../../../../ai-credits/infrastructure/price-aware-transaction';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    DictionaryAiCreditsExhaustedError,
    DictionaryDocumentUploadCapacityError,
    DictionaryDocumentUploadNotFoundError,
    DictionaryGenerationJobNotFoundError,
    DictionaryGenerationNotAvailableError,
    DictionaryIdempotencyConflictError,
    DictionaryNotFoundError,
    DictionaryVersionConflictError,
} from '../../../application/dictionary-errors';
import type { DictionaryDocumentStore } from '../../../application/ports/dictionary-document-store';
import { dictionaryDocumentGenerationFormat } from '../../../domain/document-ingestion';
import { activeProviderExecution } from './dictionary-document-accounting';
import type { DictionaryDocumentPersistenceContext } from './dictionary-document-context';
import {
    documentAdmissionLock,
    documentQueueQuota,
    documentQuota,
    formatByMediaType,
} from './dictionary-document-context';
import { abort, effectiveSettings } from './dictionary-document-validation';
import { enableAiCreditSettlement } from './dictionary-document-accounting';
import { dictionaryActionInputOverhead } from './legacy-generation-input-limit';
import {
    dictionariesTable,
    dictionaryDocumentUploadsTable,
    dictionaryGenerationJobsTable,
    dictionarySettingsTable,
} from './schema';

export async function authorize(
    context: DictionaryDocumentPersistenceContext,
    input: Parameters<DictionaryDocumentStore['authorize']>[0],
) {
    const authorization = await modelPricingTransaction(
        context.database,
        async (tx) => {
            await enableAiCreditSettlement(tx);
            abort(input.context.signal);
            await tx.execute(
                sql`select pg_advisory_xact_lock(${documentAdmissionLock})`,
            );

            await tx
                .select({ id: usersTable.id })
                .from(usersTable)
                .where(eq(usersTable.id, input.ownerId))
                .for('update');

            const [replayJob] = await tx
                .select()
                .from(dictionaryGenerationJobsTable)
                .where(
                    and(
                        eq(
                            dictionaryGenerationJobsTable.ownerId,
                            input.ownerId,
                        ),
                        eq(
                            dictionaryGenerationJobsTable.kind,
                            'document-terms',
                        ),
                        eq(
                            dictionaryGenerationJobsTable.idempotencyKey,
                            input.idempotencyKey,
                        ),
                    ),
                )
                .limit(1)
                .for('share');

            if (replayJob) {
                if (replayJob.requestFingerprint !== input.fingerprint)
                    throw new DictionaryIdempotencyConflictError();
                const [upload] = await tx
                    .select()
                    .from(dictionaryDocumentUploadsTable)
                    .where(
                        eq(dictionaryDocumentUploadsTable.jobId, replayJob.id),
                    )
                    .limit(1);

                if (!upload) throw new DictionaryDocumentUploadNotFoundError();

                return { jobId: replayJob.id, upload };
            }

            const [current] = await tx
                .select({
                    dictionary: dictionariesTable,
                    settings: dictionarySettingsTable,
                })
                .from(dictionariesTable)
                .innerJoin(
                    dictionarySettingsTable,
                    eq(
                        dictionarySettingsTable.dictionaryId,
                        dictionariesTable.id,
                    ),
                )
                .where(
                    and(
                        eq(dictionariesTable.id, input.dictionaryId),
                        eq(dictionariesTable.ownerId, input.ownerId),
                    ),
                )
                .for('update');

            if (!current || current.dictionary.lifecycle !== 'active')
                throw new DictionaryNotFoundError();
            if (
                current.dictionary.version !==
                    input.expectedDictionaryVersion ||
                current.settings.version !== input.expectedSettingsVersion
            )
                throw new DictionaryVersionConflictError();

            const [queue] = await tx
                .select({
                    global: count(),
                    owner: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.ownerId} = ${input.ownerId})`,
                })
                .from(dictionaryGenerationJobsTable)
                .where(
                    sql`${dictionaryGenerationJobsTable.executionState} in ('queued', 'running')`,
                );

            if (
                Number(queue?.global ?? 0) >= documentQueueQuota.global ||
                Number(queue?.owner ?? 0) >= documentQueueQuota.owner
            )
                throw new DictionaryGenerationNotAvailableError();

            const [quota] = await tx
                .select({
                    globalBytes: sql<number>`coalesce(sum(${dictionaryDocumentUploadsTable.accountedPhysicalBytes}) filter (where ${dictionaryDocumentUploadsTable.quotaReleasedAt} is null), 0)`,
                    globalUploads: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.quotaReleasedAt} is null)`,
                    ownerBytes: sql<number>`coalesce(sum(${dictionaryDocumentUploadsTable.accountedPhysicalBytes}) filter (where ${dictionaryDocumentUploadsTable.quotaReleasedAt} is null and ${dictionaryDocumentUploadsTable.ownerId} = ${input.ownerId}), 0)`,
                    ownerUploads: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.quotaReleasedAt} is null and ${dictionaryDocumentUploadsTable.ownerId} = ${input.ownerId})`,
                })
                .from(dictionaryDocumentUploadsTable);

            if (
                Number(quota?.ownerUploads ?? 0) >=
                    documentQuota.ownerUploads ||
                Number(quota?.globalUploads ?? 0) >=
                    documentQuota.globalUploads ||
                Number(quota?.ownerBytes ?? 0) + input.expectedSizeBytes >
                    documentQuota.ownerBytes ||
                Number(quota?.globalBytes ?? 0) + input.expectedSizeBytes >
                    documentQuota.globalBytes
            )
                throw new DictionaryDocumentUploadCapacityError();

            const jobId = context.ids.generate();
            const providerExecution = await activeProviderExecution(
                context,
                tx,
                input.ownerId,
                dictionaryDocumentGenerationFormat,
                input.context.now,
            );
            const creditPricing = context.aiCreditEnforcementEnabled
                ? providerExecution.snapshot?.creditPricing
                : undefined;

            if (
                context.aiCreditEnforcementEnabled &&
                (!providerExecution.revisionId || !creditPricing)
            )
                throw new DictionaryGenerationNotAvailableError();
            const uploadId = context.ids.generate();
            const objectKey = `dictionary-documents/${input.ownerId}/${uploadId}`;
            const [admittedJob] = await tx
                .insert(dictionaryGenerationJobsTable)
                .values({
                    ...(creditPricing
                        ? {
                              aiCreditAccounted: false,
                              maxAttempts: 2,
                              aiCreditInputCreditsPerMillionTokens:
                                  creditPricing.inputCreditsPerMillionTokens,
                              aiCreditMaxCreditsPerAttempt:
                                  creditPricing.maxCreditsPerAttempt,
                              aiCreditOutputCreditsPerMillionTokens:
                                  creditPricing.outputCreditsPerMillionTokens,
                              aiCreditPricingRevision: creditPricing.revision,
                          }
                        : {}),
                    awaitingUploadAt: input.context.now,
                    createdAt: input.context.now,
                    dictionaryId: input.dictionaryId,
                    executionRevisionId: providerExecution.revisionId,
                    selectedExecutionVersion:
                        providerExecution.selectionVersion,
                    selectedExecutionSnapshot:
                        providerExecution.selectionVersion
                            ? providerExecution.snapshot
                            : null,
                    expectedCardVersion: null,
                    expectedDictionaryVersion: input.expectedDictionaryVersion,
                    expectedSettingsVersion: input.expectedSettingsVersion,
                    format: dictionaryDocumentGenerationFormat,
                    id: jobId,
                    idempotencyKey: input.idempotencyKey,
                    inputPayload: {
                        context: {
                            dictionaryId: input.dictionaryId,
                            expectedDictionaryVersion:
                                input.expectedDictionaryVersion,
                            expectedSettingsVersion:
                                input.expectedSettingsVersion,
                            sourceLanguage:
                                current.dictionary.sourceLanguageTag,
                            targetLanguage:
                                current.dictionary.targetLanguageTag,
                        },
                        effectiveSettings: effectiveSettings(current.settings),
                        format: dictionaryDocumentGenerationFormat,
                        instruction: input.instruction,
                        translationContext:
                            current.dictionary.translationContext,
                        uploadId,
                    },
                    kind: 'document-terms',
                    nextAttemptAt: input.context.now,
                    ownerId: input.ownerId,
                    providerInputCostMicrosPerMillionTokens:
                        providerExecution.budget
                            .inputCostMicrosPerMillionTokens,
                    providerMaxCostMicrosPerAttempt:
                        providerExecution.budget.maxCostMicrosPerAttempt,
                    providerMaxInputTokensPerAttempt:
                        providerExecution.budget.maxInputTokensPerAttempt,
                    providerMaxOutputTokensPerAttempt:
                        providerExecution.budget.maxOutputTokensPerAttempt,
                    providerOutputCostMicrosPerMillionTokens:
                        providerExecution.budget
                            .outputCostMicrosPerMillionTokens,
                    progressPercent: 0,
                    progressStage: 'awaiting_upload',
                    requestFingerprint: input.fingerprint,
                    sourceLanguageTag: current.dictionary.sourceLanguageTag,
                    targetLanguageTag: current.dictionary.targetLanguageTag,
                    updatedAt: input.context.now,
                })
                .returning();

            if (
                admittedJob &&
                usesLegacyAction(admittedJob.selectedExecutionSnapshot)
            ) {
                await reserveLegacyAction(tx, {
                    id: admittedJob.id,
                    requestKey: admittedJob.idempotencyKey,
                    fingerprint: admittedJob.requestFingerprint,
                    scope: `dictionary-generation:${admittedJob.kind}`,
                    ownerId: admittedJob.ownerId,
                    kind: 'dictionary-generation',
                    snapshot: admittedJob.selectedExecutionSnapshot,
                    inputPayload: admittedJob.inputPayload,
                    inputOverheadTokens: dictionaryActionInputOverhead(
                        admittedJob.inputPayload,
                    ),
                    at: input.context.now,
                });
            } else if (creditPricing) {
                const reservationId = context.ids.generate();
                try {
                    const reservation =
                        await new DrizzleAiCreditTransactionParticipant(
                            tx,
                        ).reserveAttempt({
                            at: input.context.now,
                            attempt: 1,
                            jobId,
                            maximumCredits: BigInt(
                                creditPricing.maxCreditsPerAttempt,
                            ),
                            ownerId: input.ownerId,
                            reservationId,
                        });

                    await tx
                        .update(dictionaryGenerationJobsTable)
                        .set({
                            aiCreditPolicyMode: reservation.policy.mode,
                            aiCreditReservationId: reservationId,
                        })
                        .where(eq(dictionaryGenerationJobsTable.id, jobId));
                } catch (error) {
                    if (error instanceof AiCreditInsufficientBalanceError)
                        throw new DictionaryAiCreditsExhaustedError();

                    throw error;
                }
            }

            const [upload] = await tx
                .insert(dictionaryDocumentUploadsTable)
                .values({
                    accountedPhysicalBytes: input.expectedSizeBytes,
                    capabilityExpiresAt: input.capabilityExpiresAt,
                    cleanupNextAttemptAt: input.context.now,
                    createdAt: input.context.now,
                    dictionaryId: input.dictionaryId,
                    expectedChecksumSha256: input.expectedChecksumSha256,
                    expectedContentType: input.expectedContentType,
                    expectedFormat:
                        formatByMediaType[input.expectedContentType],
                    expectedSizeBytes: input.expectedSizeBytes,
                    id: uploadId,
                    jobId,
                    objectKey,
                    ownerId: input.ownerId,
                    updatedAt: input.context.now,
                })
                .returning();

            return { jobId, upload: upload! };
        },
    );
    const job = await context.generationStore.read({
        context: input.context,
        jobId: authorization.jobId,
        ownerId: input.ownerId,
    });

    if (job.kind !== 'document-terms')
        throw new DictionaryGenerationJobNotFoundError();

    return {
        capabilityExpiresAt: authorization.upload.capabilityExpiresAt,
        job,
        objectKey: authorization.upload.objectKey,
        uploadId: authorization.upload.id,
    };
}
