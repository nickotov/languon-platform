import {
    DictionaryCardAuthoringAnyGenerationJobSchema,
    DictionaryCardAuthoringProposalSchema,
    DictionaryCardAuthoringV2ProposalSchema,
    DictionaryCardAuthoringV3ProposalSchema,
    DictionaryGenerationJobSchema,
    DictionaryImportPairsGenerationAcceptedOutcomeSchema,
    DictionaryImportPairsGenerationProposalSchema,
    DictionaryPastedTermsGenerationAcceptedOutcomeSchema,
    DictionaryPastedTermsGenerationProposalSchema,
} from '@languon/contracts';
import type { OwnedDictionary } from '@languon/contracts';
import {
    dictionaryCardAuthoringGenerationFormat,
    dictionaryCardAuthoringGenerationFormatV2,
    usesModernCardAuthoringSemantics,
} from '../../../domain/card-authoring';
import {
    DictionaryGenerationNotAvailableError,
    isDictionaryGenerationFailureRetryable,
} from '../../../application/dictionary-errors';
import type { DictionaryGenerationJobView } from '../../../application/ports/dictionary-generation-store';
import {
    parseDictionaryGenerationInput,
    parseDictionaryGenerationProposal,
} from '../../../domain/generation';
import type { dictionariesTable } from './schema';
import type { SettingsRow, JobRow, ProposalRow } from './generation-context';
import { isSingleCardGenerationInput } from './generation-input';

export function iso(value: Date): string {
    return value.toISOString();
}

export function mapOwnedDictionary(
    dictionary: typeof dictionariesTable.$inferSelect,
    settings: SettingsRow,
    activeCardCount: number,
    retainedCardCount: number,
): OwnedDictionary {
    return {
        activeCardCount,
        archivedAt: dictionary.archivedAt?.toISOString() ?? null,
        createdAt: dictionary.createdAt.toISOString(),
        description: dictionary.description,
        id: dictionary.id,
        languagePairLocked: retainedCardCount > 0,
        lifecycle: dictionary.lifecycle,
        name: dictionary.name,
        translationContext: dictionary.translationContext,
        settings: {
            updatedAt: settings.updatedAt.toISOString(),
            values: {
                definitionEnabled: settings.definitionEnabled,
                definitionLanguage: settings.definitionLanguageRole,
                exampleEnabled: settings.exampleEnabled,
                exampleLanguage: settings.exampleLanguageRole,
                exampleTranslationEnabled: settings.exampleTranslationEnabled,
                transcriptionCustomLabel: settings.customNotationLabel,
                transcriptionEnabled: settings.transcriptionEnabled,
                transcriptionNotation: settings.transcriptionNotation,
            },
            version: settings.version,
        },
        settingsVersion: settings.version,
        sourceDictionaryId: dictionary.sourceDictionaryId,
        sourceLanguage:
            dictionary.sourceLanguageTag as OwnedDictionary['sourceLanguage'],
        targetLanguage:
            dictionary.targetLanguageTag as OwnedDictionary['targetLanguage'],
        updatedAt: dictionary.updatedAt.toISOString(),
        version: dictionary.version,
        visibility: dictionary.visibility,
    };
}

export function publicState(job: JobRow, proposal: ProposalRow | null) {
    if (job.awaitingUploadAt) return 'awaiting-upload' as const;
    if (proposal?.documentStagedAt && !proposal.documentPublishedAt) {
        if (job.executionState === 'cancelled') return 'cancelled' as const;
        if (job.executionState === 'failed') return 'failed' as const;
        if (job.executionState === 'expired') return 'expired' as const;

        return 'running' as const;
    }

    if (proposal?.reviewState === 'accepted') return 'accepted' as const;
    if (proposal?.reviewState === 'discarded') return 'discarded' as const;
    if (proposal?.reviewState === 'expired') return 'expired' as const;
    if (
        proposal?.reviewState === 'reviewable' &&
        (!proposal.documentStagedAt || proposal.documentPublishedAt)
    )
        return 'review' as const;
    if (job.executionState === 'cancelled') return 'cancelled' as const;

    return job.executionState === 'completed'
        ? ('failed' as const)
        : job.executionState;
}

export function mapJob(
    job: JobRow,
    proposal: ProposalRow | null,
): DictionaryGenerationJobView {
    const state = publicState(job, proposal);
    const input = job.inputPayload
        ? parseDictionaryGenerationInput(job.inputPayload)
        : null;
    const failureCodes = [
        'provider_unavailable',
        'provider_timeout',
        'provider_rate_limited',
        'invalid_model_output',
        'generation_conflict',
        'retry_exhausted',
        'ai_credits_exhausted',
        'internal_error',
        'malware_detected',
        'scan_failed',
        'unsupported_document',
        'invalid_document',
        'too_many_terms',
        'no_terms_found',
        'extraction_failed',
        'ocr_failed',
    ] as const;
    const failureCode = failureCodes.includes(
        job.failureCategory as (typeof failureCodes)[number],
    )
        ? (job.failureCategory as (typeof failureCodes)[number])
        : 'internal_error';
    const shared = {
        cancellationRequested: job.cancellationRequestedAt !== null,
        completedAt:
            state === 'accepted' || state === 'discarded'
                ? (proposal?.terminalAt?.toISOString() ?? null)
                : state === 'expired'
                  ? ((proposal?.terminalAt ?? job.completedAt)?.toISOString() ??
                    null)
                  : ['cancelled', 'failed'].includes(state)
                    ? ((
                          job.completedAt ?? job.cancellationRequestedAt
                      )?.toISOString() ?? null)
                    : null,
        createdAt: iso(job.createdAt),
        dictionaryId: job.dictionaryId,
        expectedDictionaryVersion: job.expectedDictionaryVersion,
        expectedSettingsVersion: job.expectedSettingsVersion,
        expiresAt:
            state === 'review'
                ? (proposal?.expiresAt.toISOString() ?? null)
                : null,
        failure:
            state === 'failed'
                ? {
                      code: failureCode,
                      message: 'Generation could not be completed.',
                      retryable:
                          isDictionaryGenerationFailureRetryable(failureCode),
                  }
                : null,
        id: job.id,
        progress: {
            percent:
                state === 'review' ||
                [
                    'accepted',
                    'discarded',
                    'cancelled',
                    'failed',
                    'expired',
                ].includes(state)
                    ? 100
                    : job.progressPercent,
            stage:
                state === 'awaiting-upload'
                    ? 'awaiting_upload'
                    : state === 'queued'
                      ? 'queued'
                      : state === 'running'
                        ? job.kind === 'document-terms' &&
                          [
                              'scanning',
                              'extracting',
                              'ocr',
                              'generating',
                              'validating',
                              'cleaning',
                          ].includes(job.progressStage)
                            ? (job.progressStage as
                                  | 'scanning'
                                  | 'extracting'
                                  | 'ocr'
                                  | 'generating'
                                  | 'validating'
                                  | 'cleaning')
                            : job.progressStage === 'validating'
                              ? 'validating'
                              : 'generating'
                        : state === 'review'
                          ? 'review_ready'
                          : 'terminal',
        },
        state: publicState(job, proposal),
        sourceLanguage: job.sourceLanguageTag,
        targetLanguage: job.targetLanguageTag,
        updatedAt: iso(
            proposal && proposal.updatedAt > job.updatedAt
                ? proposal.updatedAt
                : job.updatedAt,
        ),
    };

    if (job.kind === 'pasted-terms') {
        return DictionaryGenerationJobSchema.parse({
            ...shared,
            format: job.format,
            kind: 'pasted-terms',
            outcome:
                state === 'accepted' && proposal?.acceptedBatchOutcome
                    ? DictionaryPastedTermsGenerationAcceptedOutcomeSchema.parse(
                          proposal.acceptedBatchOutcome,
                      )
                    : null,
            proposal:
                state === 'review' && proposal?.payload
                    ? DictionaryPastedTermsGenerationProposalSchema.parse(
                          proposal.payload,
                      )
                    : null,
        });
    }

    if (job.kind === 'import-pairs') {
        return DictionaryGenerationJobSchema.parse({
            ...shared,
            format: job.format,
            kind: 'import-pairs',
            outcome:
                state === 'accepted' && proposal?.acceptedBatchOutcome
                    ? DictionaryImportPairsGenerationAcceptedOutcomeSchema.parse(
                          proposal.acceptedBatchOutcome,
                      )
                    : null,
            proposal:
                state === 'review' && proposal?.payload
                    ? DictionaryImportPairsGenerationProposalSchema.parse(
                          proposal.payload,
                      )
                    : null,
        });
    }

    if (job.kind === 'document-terms') {
        return DictionaryGenerationJobSchema.parse({
            ...shared,
            format: job.format,
            kind: 'document-terms',
            outcome:
                state === 'accepted' && proposal?.acceptedBatchOutcome
                    ? DictionaryPastedTermsGenerationAcceptedOutcomeSchema.parse(
                          proposal.acceptedBatchOutcome,
                      )
                    : null,
            proposal:
                state === 'review' && proposal?.payload
                    ? DictionaryPastedTermsGenerationProposalSchema.parse(
                          proposal.payload,
                      )
                    : null,
        });
    }

    if (job.kind === 'card-authoring') {
        const persistedAuthoringTarget =
            job.cardId && job.expectedCardVersion
                ? {
                      kind: 'update' as const,
                      cardId: job.cardId,
                      expectedCardVersion: job.expectedCardVersion,
                  }
                : ({ kind: 'create' } as const);

        if (
            usesModernCardAuthoringSemantics(job.format) &&
            input &&
            usesModernCardAuthoringSemantics(input.format) &&
            'target' in input &&
            JSON.stringify(input.target) !==
                JSON.stringify(persistedAuthoringTarget)
        )
            throw new DictionaryGenerationNotAvailableError();

        return DictionaryCardAuthoringAnyGenerationJobSchema.parse({
            ...shared,
            format: job.format,
            kind: 'card-authoring',
            ...(usesModernCardAuthoringSemantics(job.format)
                ? { target: persistedAuthoringTarget }
                : {}),
            outcome:
                state === 'accepted' &&
                proposal?.acceptedCardId &&
                proposal.acceptedCardVersion &&
                proposal.acceptedDictionaryVersion
                    ? {
                          cardId: proposal.acceptedCardId,
                          cardVersion: proposal.acceptedCardVersion,
                          dictionaryVersion: proposal.acceptedDictionaryVersion,
                          duplicateSource:
                              proposal.acceptedDuplicateSource ?? false,
                      }
                    : null,
            proposal:
                state === 'review' && proposal?.payload
                    ? job.format === dictionaryCardAuthoringGenerationFormat
                        ? DictionaryCardAuthoringV3ProposalSchema.parse(
                              proposal.payload,
                          )
                        : job.format ===
                            dictionaryCardAuthoringGenerationFormatV2
                          ? DictionaryCardAuthoringV2ProposalSchema.parse(
                                proposal.payload,
                            )
                          : DictionaryCardAuthoringProposalSchema.parse(
                                proposal.payload,
                            )
                    : null,
        });
    }

    if (job.kind !== 'single-card')
        throw new DictionaryGenerationNotAvailableError();

    return DictionaryGenerationJobSchema.parse({
        ...shared,
        cardId: job.cardId!,
        expectedCardVersion: job.expectedCardVersion!,
        format: job.format,
        kind: 'single-card',
        originalSnapshot:
            ['queued', 'running', 'review'].includes(state) &&
            isSingleCardGenerationInput(input)
                ? input.original
                : null,
        outcome:
            state === 'accepted' &&
            proposal?.acceptedCardVersion &&
            proposal.acceptedDictionaryVersion
                ? {
                      cardId: job.cardId!,
                      cardVersion: proposal.acceptedCardVersion,
                      dictionaryVersion: proposal.acceptedDictionaryVersion,
                  }
                : null,
        proposal:
            state === 'review' && proposal?.payload
                ? parseDictionaryGenerationProposal(proposal.payload)
                : null,
    });
}
