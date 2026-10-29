import { lockTextAiCapacity } from '../../../../../infrastructure/text-ai/text-ai-capacity';
import { formatCreditMilli } from '../../../../ai-credits/domain/exact-credit-amount';
import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import {
    SubmitKnowledgeTranscriptionRequestSchema,
    type SubmitKnowledgeTranscriptionRequest,
} from '@languon/contracts';
import { DrizzleCapabilityPolicyParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-capability-policy-participant';
import { DrizzleActionAccountingParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-action-accounting-participant';
import { DrizzleAiCreditTransactionParticipant } from '../../../../ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { audioActionChargeMilli } from '../../../../ai-credits/domain/action-pricing';
import { AiCreditInsufficientBalanceError } from '../../../../ai-credits/domain/ai-credit';
import { KnowledgeDomainError } from '../../../domain/knowledge';
import {
    knowledgeTranscriptionJobsTable as jobs,
    knowledgeTranscriptionReceiptsTable as receipts,
} from './transcription-accounting-schema';
import { lockKnowledgeOwner } from './knowledge-transaction';
import {
    ownedTranscriptionAudio,
    transcriptionConfiguration,
    transcriptionJob,
    type TranscriptionContext,
} from './transcription-context';

export async function submitTranscription(
    context: TranscriptionContext,
    ownerId: string,
    raw: SubmitKnowledgeTranscriptionRequest,
    signal: AbortSignal,
) {
    const input = SubmitKnowledgeTranscriptionRequestSchema.parse(raw);
    const { confirmedMaximumCredits, ...identity } = input;
    const fingerprint = createHash('sha256')
        .update(JSON.stringify(identity))
        .digest('hex');

    return context.database.transaction(async (tx) => {
        signal.throwIfAborted();
        await lockTextAiCapacity(tx);
        await new DrizzleActionAccountingParticipant(tx).lockForSettlement(
            ownerId,
        );

        await lockKnowledgeOwner(tx, ownerId);
        const [receipt] = await tx
            .select()
            .from(receipts)
            .where(eq(receipts.id, input.operationId))
            .for('update');

        if (
            receipt &&
            (receipt.ownerId !== ownerId ||
                receipt.fingerprint !== fingerprint ||
                receipt.noteId !== input.noteId)
        )
            throw new KnowledgeDomainError(
                'idempotency_conflict',
                'This operation identity was already used.',
            );
        const [existing] = await tx
            .select()
            .from(jobs)
            .where(
                and(eq(jobs.id, input.operationId), eq(jobs.ownerId, ownerId)),
            )
            .for('update');

        if (receipt && !existing)
            throw new KnowledgeDomainError(
                'knowledge_not_found',
                'This transcription was deleted and cannot be recreated.',
            );
        if (existing && existing.state !== 'confirmation-required')
            return transcriptionJob(existing);
        const source = await ownedTranscriptionAudio(
            tx,
            ownerId,
            input.noteId,
            input.assetId,
        );
        const at = context.clock.now();
        const deadlineAt = new Date(at.getTime() + 10 * 60_000);
        const configuration = await transcriptionConfiguration(
            tx,
            at,
            deadlineAt,
            source.blob.durationMs,
            source.blob.bytes.length,
            context.credentialFingerprint,
        );
        const policyParticipant = new DrizzleCapabilityPolicyParticipant(tx);
        const policy = await policyParticipant.current('speech');
        const account = await new DrizzleAiCreditTransactionParticipant(
            tx,
        ).accountSummary(ownerId, at);
        const funding =
            policy.funding === 'operator'
                ? 'operator'
                : account.policy.effectiveMode === 'unlimited'
                  ? 'unlimited'
                  : 'customer';
        const maximumCredits =
            funding === 'customer'
                ? audioActionChargeMilli(
                      source.blob.durationMs,
                      configuration.configuration.creditsPerMinute!,
                  )
                : 0n;
        const needsConfirmation =
            maximumCredits > 0n &&
            confirmedMaximumCredits !== formatCreditMilli(maximumCredits);

        if (
            existing &&
            (existing.configurationRevisionId !==
                configuration.configuration.id ||
                existing.checksum !== source.blob.checksum)
        )
            throw new KnowledgeDomainError(
                'version_conflict',
                'Transcription configuration changed. Start a fresh preview.',
            );
        if (!existing) {
            await tx.insert(receipts).values({
                id: input.operationId,
                ownerId,
                noteId: input.noteId,
                fingerprint,
                createdAt: at,
            });

            await tx.insert(jobs).values({
                id: input.operationId,
                ownerId,
                noteId: input.noteId,
                assetId: input.assetId,
                fingerprint,
                checksum: source.blob.checksum,
                languages: input.languages,
                configurationRevisionId: configuration.configuration.id,
                processingControlsRevision:
                    configuration.configuration.processingControlsRevision,
                processingCredentialFingerprint:
                    configuration.configuration.processingCredentialFingerprint,
                providerPriceSnapshot: configuration.price,
                sourceDurationMs: source.blob.durationMs,
                byteLength: source.blob.bytes.length,
                maximumCreditsMilli: maximumCredits,
                state: needsConfirmation ? 'confirmation-required' : 'queued',
                deadlineAt,
                createdAt: at,
                updatedAt: at,
            });
        } else
            await tx
                .update(jobs)
                .set({
                    state: needsConfirmation
                        ? 'confirmation-required'
                        : 'queued',
                    maximumCreditsMilli: maximumCredits,
                    deadlineAt,
                    updatedAt: at,
                })
                .where(eq(jobs.id, input.operationId));
        if (!needsConfirmation) {
            await policyParticipant.pinAction({
                jobId: input.operationId,
                jobKind: 'knowledge-transcription',
                ownerId,
                at,
                policy,
            });

            const action = await new DrizzleActionAccountingParticipant(
                tx,
            ).reserve({
                id: input.operationId,
                ownerId,
                capability: 'speech',
                funding,
                policyVersion: policy.version,
                tariff: {
                    inputCreditsPerMillionTokens: '0',
                    outputCreditsPerMillionTokens: '0',
                    audioCreditsPerMinute:
                        configuration.configuration.creditsPerMinute!,
                },
                usageMeter: 'audio-duration',
                audioInputLimitMilliseconds: source.blob.durationMs,
                budgetMilli: maximumCredits,
                holdMaximumMilli: maximumCredits,
                outputLimit: 0,
                operatorMaximumMicros: configuration.providerMaximumMicros,
                at,
                deadlineAt,
            });

            if (funding === 'customer' && action.heldMilli < maximumCredits)
                throw new AiCreditInsufficientBalanceError();
        }

        signal.throwIfAborted();
        const [saved] = await tx
            .select()
            .from(jobs)
            .where(eq(jobs.id, input.operationId));

        return transcriptionJob(saved!);
    });
}
