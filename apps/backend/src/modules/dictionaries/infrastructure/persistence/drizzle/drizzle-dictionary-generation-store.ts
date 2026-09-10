import { dictionaryDocumentGenerationFormat } from '../../../domain/document-ingestion';
import {
    DictionaryCardAuthoringGenerationJobSchema,
    DictionaryCardAuthoringProposalSchema,
    DictionaryAiImportResponseSchema,
    DictionaryGenerationJobSchema,
    DictionaryImportPairsGenerationAcceptedOutcomeSchema,
    DictionaryImportPairsGenerationProposalSchema,
    DictionaryPastedTermsGenerationAcceptedOutcomeSchema,
    DictionaryPastedTermsGenerationProposalSchema,
} from '@languon/contracts';
import type { OwnedDictionary } from '@languon/contracts';
import {
    DictionaryCardAuthoringGenerationInputPayloadSchema,
    dictionaryCardAuthoringExcludedValueLimitPerField,
    DictionaryCardAuthoringProposalPayloadSchema,
    DictionaryCardAuthoringProviderDeltaSchema,
    DictionaryCardAuthoringSuggestionLimitError,
    dictionaryCardAuthoringSuggestionLimitPerField,
    dictionaryCardAuthoringGenerationFormat,
    mergeDictionaryCardAuthoringProposal,
    resolveDictionaryCardAuthoringFields,
    type DictionaryCardAuthoringProposalPayload,
} from '../../../domain/card-authoring';
import {
    and,
    asc,
    count,
    desc,
    eq,
    gt,
    gte,
    inArray,
    isNotNull,
    isNull,
    lt,
    lte,
    or,
    sql,
} from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import {
    DictionaryCardNotFoundError,
    DictionaryGenerationCandidateConflictError,
    DictionaryGenerationCompletionConflictError,
    DictionaryGenerationJobNotFoundError,
    DictionaryGenerationNotAvailableError,
    DictionaryGenerationNotReviewableError,
    DictionaryGenerationProposalExpiredError,
    DictionaryIdempotencyConflictError,
    isDictionaryGenerationFailureRetryable,
    DictionaryNotFoundError,
    DictionaryVersionConflictError,
} from '../../../application/dictionary-errors';
import type {
    ClaimedDictionaryGenerationJob,
    DictionaryGenerationJobView,
    DictionaryGenerationStore,
    DictionaryOperationalMeasurement,
} from '../../../application/ports/dictionary-generation-store';
import type { DictionaryOperationContext } from '../../../application/ports/dictionary-store';
import {
    defaultDictionaryGenerationProviderBudgetPolicy,
    dictionaryGenerationProviderUsageCostMicros,
    type DictionaryGenerationProviderBudgetPolicy,
} from '../../../application/ports/dictionary-generation-provider-policy';
import {
    areCardSemanticStatesEqual,
    resolveCardMutationAuthorship,
} from '../../../domain/authorship';
import {
    createDictionaryBatchDuplicateWarnings,
    parseDictionaryImportPairsGenerationProposal,
    parseDictionaryBatchGenerationProposal,
    parseDictionaryBatchGenerationText,
} from '../../../domain/batch-generation';
import {
    dictionaryGenerationFormat,
    dictionaryImportPairsGenerationFormat,
    dictionaryPastedTermsGenerationFormat,
    parseDictionaryGenerationInput,
    parseDictionaryGenerationProposal,
} from '../../../domain/generation';
import {
    assertDictionaryOwnerCapacity,
    dictionaryLimits,
    normalizeCardValues,
    normalizeDictionaryCardSourceForSearch,
    normalizeDictionaryDetails,
} from '../../../domain/limits';
import {
    assertDictionaryCardCapacity,
    dictionaryCardSortGap,
} from '../../../domain/ordering';
import {
    assertCardSettingsOverrideTransition,
    defaultDictionarySettings,
    normalizeCardSettingsOverrides,
    resolveCardSettings,
    type CardSettingsOverrides,
    type DictionarySettings,
} from '../../../domain/settings';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import { DictionaryCardRevisionSnapshotSchema } from './revision-snapshot-schema';
import {
    dictionariesTable,
    dictionaryCardRevisionsTable,
    dictionaryCardsTable,
    dictionaryGenerationJobsTable,
    dictionaryGenerationProposalsTable,
    dictionaryGenerationProviderCircuitTable,
    dictionaryIdempotencyKeysTable,
    dictionaryDocumentUploadsTable,
    dictionarySettingsTable,
} from './schema';

type Database = PostgresJsDatabase<typeof databaseSchema>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type JobRow = typeof dictionaryGenerationJobsTable.$inferSelect;
type ProposalRow = typeof dictionaryGenerationProposalsTable.$inferSelect;
type CardRow = typeof dictionaryCardsTable.$inferSelect;
type SettingsRow = typeof dictionarySettingsTable.$inferSelect;

export const dictionaryGenerationAdmissionLock = 4_312_189_072;
const generationLimits = {
    globalQueued: 1_000,
    maxRunnableQueueAgeMs: 300_000,
    ownerQueued: 5,
} as const;
const bulkIdempotencyLifetimeMs = 24 * 60 * 60 * 1_000;
const providerOperationalBudget = {
    circuitFailureThreshold: 3,
    circuitOpenMs: 60_000,
    dailyGlobalAttempts: 20,
    dailyOwnerAttempts: 3,
    globalActiveAttempts: 10,
    ownerActiveAttempts: 3,
} as const;

export interface DictionaryGenerationProviderBudgetUsage {
    globalActiveCostMicros: number;
    globalActiveInputTokens: number;
    globalActiveOutputTokens: number;
    globalSettledCostMicros: number;
    globalSettledInputTokens: number;
    globalSettledOutputTokens: number;
    ownerActiveCostMicros: number;
    ownerActiveInputTokens: number;
    ownerActiveOutputTokens: number;
    ownerSettledCostMicros: number;
    ownerSettledInputTokens: number;
    ownerSettledOutputTokens: number;
}

export function dictionaryGenerationProviderBudgetAllows(
    usage: DictionaryGenerationProviderBudgetUsage,
    includeNewReservation: boolean,
    policy: DictionaryGenerationProviderBudgetPolicy,
): boolean {
    const reservation = includeNewReservation
        ? {
              costMicros: policy.maxCostMicrosPerAttempt,
              inputTokens: policy.maxInputTokensPerAttempt,
              outputTokens: policy.maxOutputTokensPerAttempt,
          }
        : { costMicros: 0, inputTokens: 0, outputTokens: 0 };
    return (
        usage.globalActiveCostMicros + reservation.costMicros <=
            policy.maxCostMicrosPerAttempt *
                providerOperationalBudget.globalActiveAttempts &&
        usage.globalActiveInputTokens + reservation.inputTokens <=
            policy.maxInputTokensPerAttempt *
                providerOperationalBudget.globalActiveAttempts &&
        usage.globalActiveOutputTokens + reservation.outputTokens <=
            policy.maxOutputTokensPerAttempt *
                providerOperationalBudget.globalActiveAttempts &&
        usage.ownerActiveCostMicros + reservation.costMicros <=
            policy.maxCostMicrosPerAttempt *
                providerOperationalBudget.ownerActiveAttempts &&
        usage.ownerActiveInputTokens + reservation.inputTokens <=
            policy.maxInputTokensPerAttempt *
                providerOperationalBudget.ownerActiveAttempts &&
        usage.ownerActiveOutputTokens + reservation.outputTokens <=
            policy.maxOutputTokensPerAttempt *
                providerOperationalBudget.ownerActiveAttempts &&
        usage.globalSettledCostMicros +
            usage.globalActiveCostMicros +
            reservation.costMicros <=
            policy.maxCostMicrosPerAttempt *
                providerOperationalBudget.dailyGlobalAttempts &&
        usage.globalSettledInputTokens +
            usage.globalActiveInputTokens +
            reservation.inputTokens <=
            policy.maxInputTokensPerAttempt *
                providerOperationalBudget.dailyGlobalAttempts &&
        usage.globalSettledOutputTokens +
            usage.globalActiveOutputTokens +
            reservation.outputTokens <=
            policy.maxOutputTokensPerAttempt *
                providerOperationalBudget.dailyGlobalAttempts &&
        usage.ownerSettledCostMicros +
            usage.ownerActiveCostMicros +
            reservation.costMicros <=
            policy.maxCostMicrosPerAttempt *
                providerOperationalBudget.dailyOwnerAttempts &&
        usage.ownerSettledInputTokens +
            usage.ownerActiveInputTokens +
            reservation.inputTokens <=
            policy.maxInputTokensPerAttempt *
                providerOperationalBudget.dailyOwnerAttempts &&
        usage.ownerSettledOutputTokens +
            usage.ownerActiveOutputTokens +
            reservation.outputTokens <=
            policy.maxOutputTokensPerAttempt *
                providerOperationalBudget.dailyOwnerAttempts
    );
}

function abort(context: DictionaryOperationContext): void {
    context.signal.throwIfAborted();
}

function persistedProviderBudget(
    job: Pick<
        JobRow,
        | 'providerInputCostMicrosPerMillionTokens'
        | 'providerMaxCostMicrosPerAttempt'
        | 'providerMaxInputTokensPerAttempt'
        | 'providerMaxOutputTokensPerAttempt'
        | 'providerOutputCostMicrosPerMillionTokens'
    >,
): DictionaryGenerationProviderBudgetPolicy {
    return {
        inputCostMicrosPerMillionTokens:
            job.providerInputCostMicrosPerMillionTokens,
        maxCostMicrosPerAttempt: job.providerMaxCostMicrosPerAttempt,
        maxInputTokensPerAttempt: job.providerMaxInputTokensPerAttempt,
        maxOutputTokensPerAttempt: job.providerMaxOutputTokensPerAttempt,
        outputCostMicrosPerMillionTokens:
            job.providerOutputCostMicrosPerMillionTokens,
    };
}

function iso(value: Date): string {
    return value.toISOString();
}

function domainSettings(row: SettingsRow): DictionarySettings {
    return {
        customNotationLabel: row.customNotationLabel,
        definitionEnabled: row.definitionEnabled,
        definitionLanguageRole: row.definitionLanguageRole,
        exampleEnabled: row.exampleEnabled,
        exampleLanguageRole: row.exampleLanguageRole,
        exampleTranslationEnabled: row.exampleTranslationEnabled,
        transcriptionEnabled: row.transcriptionEnabled,
        transcriptionNotation: row.transcriptionNotation,
        version: row.version,
    };
}

function domainOverrides(input: {
    definitionEnabled: 'disabled' | 'enabled' | null;
    definitionLanguage: 'source' | 'target' | null;
    exampleEnabled: 'disabled' | 'enabled' | null;
    exampleLanguage: 'source' | 'target' | null;
    exampleTranslationEnabled: 'disabled' | 'enabled' | null;
    transcriptionCustomLabel: string | null;
    transcriptionEnabled: 'disabled' | 'enabled' | null;
    transcriptionNotation: 'custom' | 'ipa' | 'romanization' | null;
}): CardSettingsOverrides {
    return normalizeCardSettingsOverrides({
        customNotationLabel: input.transcriptionCustomLabel,
        definitionEnabled: input.definitionEnabled,
        definitionLanguageRole: input.definitionLanguage,
        exampleEnabled: input.exampleEnabled,
        exampleLanguageRole: input.exampleLanguage,
        exampleTranslationEnabled: input.exampleTranslationEnabled,
        transcriptionEnabled: input.transcriptionEnabled,
        transcriptionNotation: input.transcriptionNotation,
    });
}

function wireOverrides(row: CardRow) {
    return {
        definitionEnabled: row.definitionEnabledOverride,
        definitionLanguage: row.definitionLanguageRoleOverride,
        exampleEnabled: row.exampleEnabledOverride,
        exampleLanguage: row.exampleLanguageRoleOverride,
        exampleTranslationEnabled: row.exampleTranslationEnabledOverride,
        transcriptionCustomLabel: row.customNotationLabelOverride,
        transcriptionEnabled: row.transcriptionEnabledOverride,
        transcriptionNotation: row.transcriptionNotationOverride,
    };
}

function values(row: CardRow) {
    return {
        definition: row.definition,
        example: row.example,
        exampleTranslation: row.exampleTranslation,
        source: row.source,
        transcription: row.transcription,
        translation: row.translation,
    };
}

function wireEffectiveSettings(settings: SettingsRow) {
    const effective = resolveCardSettings({
        dictionary: domainSettings(settings),
        overrides: normalizeCardSettingsOverrides({
            customNotationLabel: null,
            definitionEnabled: null,
            definitionLanguageRole: null,
            exampleEnabled: null,
            exampleLanguageRole: null,
            exampleTranslationEnabled: null,
            transcriptionEnabled: null,
            transcriptionNotation: null,
        }),
    });
    return {
        definitionEnabled: effective.definitionEnabled,
        definitionLanguage: effective.definitionLanguageRole,
        exampleEnabled: effective.exampleEnabled,
        exampleLanguage: effective.exampleLanguageRole,
        exampleTranslationEnabled: effective.exampleTranslationEnabled,
        exampleTranslationLanguage: effective.exampleTranslationLanguageRole,
        transcriptionCustomLabel: effective.customNotationLabel,
        transcriptionEnabled: effective.transcriptionEnabled,
        transcriptionNotation: effective.transcriptionNotation,
    };
}

function wireEffectiveSettingsForOverrides(
    settings: SettingsRow,
    overrides: ReturnType<typeof domainOverrides>,
) {
    const effective = resolveCardSettings({
        dictionary: domainSettings(settings),
        overrides,
    });
    return {
        definitionEnabled: effective.definitionEnabled,
        definitionLanguage: effective.definitionLanguageRole,
        exampleEnabled: effective.exampleEnabled,
        exampleLanguage: effective.exampleLanguageRole,
        exampleTranslationEnabled: effective.exampleTranslationEnabled,
        exampleTranslationLanguage: effective.exampleTranslationLanguageRole,
        transcriptionCustomLabel: effective.customNotationLabel,
        transcriptionEnabled: effective.transcriptionEnabled,
        transcriptionNotation: effective.transcriptionNotation,
    };
}

function mapOwnedDictionary(
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

function publicState(job: JobRow, proposal: ProposalRow | null) {
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

function mapJob(
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
            format: dictionaryPastedTermsGenerationFormat,
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
            format: dictionaryImportPairsGenerationFormat,
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
            format: dictionaryDocumentGenerationFormat,
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
        return DictionaryCardAuthoringGenerationJobSchema.parse({
            ...shared,
            format: dictionaryCardAuthoringGenerationFormat,
            kind: 'card-authoring',
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
                    ? DictionaryCardAuthoringProposalSchema.parse(
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
        format: dictionaryGenerationFormat,
        kind: 'single-card',
        originalSnapshot:
            ['queued', 'running', 'review'].includes(state) &&
            input?.format === dictionaryGenerationFormat
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

function revisionSnapshot(row: CardRow, settings: SettingsRow) {
    return DictionaryCardRevisionSnapshotSchema.parse({
        authorship: row.authorship,
        cardVersion: row.version,
        effectiveSettings: resolveCardSettings({
            dictionary: domainSettings(settings),
            overrides: domainOverrides(wireOverrides(row)),
        }),
        rawOverrides: domainOverrides(wireOverrides(row)),
        schemaVersion: 1,
        settingsVersion: settings.version,
        values: values(row),
    });
}

export interface DictionaryGenerationIdGenerator {
    generate(): string;
}

export class DrizzleDictionaryGenerationStore implements DictionaryGenerationStore {
    public constructor(
        private readonly database: Database,
        private readonly ids: DictionaryGenerationIdGenerator,
        private readonly providerBudget: DictionaryGenerationProviderBudgetPolicy = defaultDictionaryGenerationProviderBudgetPolicy,
    ) {}

    public async enqueue(
        input: Parameters<DictionaryGenerationStore['enqueue']>[0],
    ) {
        return this.database.transaction(async (tx) => {
            abort(input.context);
            await tx.execute(
                sql`select pg_advisory_xact_lock(${dictionaryGenerationAdmissionLock})`,
            );
            abort(input.context);
            await tx
                .select({ id: usersTable.id })
                .from(usersTable)
                .where(eq(usersTable.id, input.ownerId))
                .for('update');
            abort(input.context);

            const [replay] = await tx
                .select()
                .from(dictionaryGenerationJobsTable)
                .where(
                    and(
                        eq(
                            dictionaryGenerationJobsTable.ownerId,
                            input.ownerId,
                        ),
                        eq(dictionaryGenerationJobsTable.kind, 'single-card'),
                        eq(
                            dictionaryGenerationJobsTable.idempotencyKey,
                            input.idempotencyKey,
                        ),
                    ),
                )
                .limit(1)
                .for('share');
            if (replay) {
                if (replay.requestFingerprint !== input.fingerprint)
                    throw new DictionaryIdempotencyConflictError();
                return this.readView(tx, replay, input.context.now);
            }

            const [current] = await tx
                .select({
                    card: dictionaryCardsTable,
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
                .innerJoin(
                    dictionaryCardsTable,
                    and(
                        eq(dictionaryCardsTable.id, input.cardId),
                        eq(
                            dictionaryCardsTable.dictionaryId,
                            dictionariesTable.id,
                        ),
                    ),
                )
                .where(
                    and(
                        eq(dictionariesTable.id, input.dictionaryId),
                        eq(dictionariesTable.ownerId, input.ownerId),
                    ),
                )
                .for('update');
            abort(input.context);
            if (!current) throw new DictionaryNotFoundError();
            if (current.card.lifecycle !== 'active')
                throw new DictionaryCardNotFoundError();
            if (
                current.dictionary.lifecycle !== 'active' ||
                current.dictionary.version !==
                    input.expectedDictionaryVersion ||
                current.settings.version !== input.expectedSettingsVersion ||
                current.card.version !== input.expectedCardVersion
            )
                throw new DictionaryVersionConflictError();

            const [providerCircuit] = await tx
                .select({
                    openUntil:
                        dictionaryGenerationProviderCircuitTable.openUntil,
                })
                .from(dictionaryGenerationProviderCircuitTable)
                .where(
                    eq(
                        dictionaryGenerationProviderCircuitTable.id,
                        dictionaryGenerationFormat,
                    ),
                )
                .limit(1);
            if (
                providerCircuit?.openUntil &&
                providerCircuit.openUntil > input.context.now
            )
                throw new DictionaryGenerationNotAvailableError();

            const [counts] = await tx
                .select({
                    global: count(),
                    oldestRunnableQueuedAt: sql<
                        string | null
                    >`min(${dictionaryGenerationJobsTable.createdAt}) filter (where ${dictionaryGenerationJobsTable.executionState} = 'queued' and ${dictionaryGenerationJobsTable.nextAttemptAt} <= ${input.context.now.toISOString()}::timestamptz)`,
                    owner: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.ownerId} = ${input.ownerId})`,
                })
                .from(dictionaryGenerationJobsTable)
                .where(
                    inArray(dictionaryGenerationJobsTable.executionState, [
                        'queued',
                        'running',
                    ]),
                );
            if (
                Number(counts?.global ?? 0) >= generationLimits.globalQueued ||
                Number(counts?.owner ?? 0) >= generationLimits.ownerQueued ||
                (counts?.oldestRunnableQueuedAt !== null &&
                    counts?.oldestRunnableQueuedAt !== undefined &&
                    new Date(counts.oldestRunnableQueuedAt).getTime() <=
                        input.context.now.getTime() -
                            generationLimits.maxRunnableQueueAgeMs)
            )
                throw new DictionaryGenerationNotAvailableError();
            const providerAdmission = await this.providerBudgetUsage(
                tx,
                input.ownerId,
                input.context.now,
            );
            if (
                !dictionaryGenerationProviderBudgetAllows(
                    providerAdmission,
                    true,
                    this.providerBudget,
                )
            )
                throw new DictionaryGenerationNotAvailableError();
            abort(input.context);

            const effective = resolveCardSettings({
                dictionary: domainSettings(current.settings),
                overrides: domainOverrides(wireOverrides(current.card)),
            });
            const payload = parseDictionaryGenerationInput({
                context: {
                    cardId: current.card.id,
                    dictionaryId: current.dictionary.id,
                    expectedCardVersion: current.card.version,
                    expectedDictionaryVersion: current.dictionary.version,
                    expectedSettingsVersion: current.settings.version,
                    sourceLanguage: current.dictionary.sourceLanguageTag,
                    targetLanguage: current.dictionary.targetLanguageTag,
                },
                format: dictionaryGenerationFormat,
                instruction: input.instruction,
                original: {
                    authorship: current.card.authorship,
                    effectiveSettings: {
                        definitionEnabled: effective.definitionEnabled,
                        definitionLanguage: effective.definitionLanguageRole,
                        exampleEnabled: effective.exampleEnabled,
                        exampleLanguage: effective.exampleLanguageRole,
                        exampleTranslationEnabled:
                            effective.exampleTranslationEnabled,
                        exampleTranslationLanguage:
                            effective.exampleTranslationLanguageRole,
                        transcriptionCustomLabel: effective.customNotationLabel,
                        transcriptionEnabled: effective.transcriptionEnabled,
                        transcriptionNotation: effective.transcriptionNotation,
                    },
                    overrides: wireOverrides(current.card),
                    values: values(current.card),
                },
            });
            const [job] = await tx
                .insert(dictionaryGenerationJobsTable)
                .values({
                    cardId: input.cardId,
                    createdAt: input.context.now,
                    dictionaryId: input.dictionaryId,
                    expectedCardVersion: input.expectedCardVersion,
                    expectedDictionaryVersion: input.expectedDictionaryVersion,
                    expectedSettingsVersion: input.expectedSettingsVersion,
                    format: dictionaryGenerationFormat,
                    id: this.ids.generate(),
                    idempotencyKey: input.idempotencyKey,
                    inputPayload: payload,
                    kind: 'single-card',
                    nextAttemptAt: input.context.now,
                    ownerId: input.ownerId,
                    providerReservationState: 'active',
                    providerInputCostMicrosPerMillionTokens:
                        this.providerBudget.inputCostMicrosPerMillionTokens,
                    providerMaxCostMicrosPerAttempt:
                        this.providerBudget.maxCostMicrosPerAttempt,
                    providerMaxInputTokensPerAttempt:
                        this.providerBudget.maxInputTokensPerAttempt,
                    providerMaxOutputTokensPerAttempt:
                        this.providerBudget.maxOutputTokensPerAttempt,
                    providerOutputCostMicrosPerMillionTokens:
                        this.providerBudget.outputCostMicrosPerMillionTokens,
                    providerReservedAttempts: 1,
                    providerReservedCostMicros:
                        this.providerBudget.maxCostMicrosPerAttempt,
                    providerReservedInputTokens:
                        this.providerBudget.maxInputTokensPerAttempt,
                    providerReservedOutputTokens:
                        this.providerBudget.maxOutputTokensPerAttempt,
                    requestFingerprint: input.fingerprint,
                    sourceLanguageTag: current.dictionary.sourceLanguageTag,
                    targetLanguageTag: current.dictionary.targetLanguageTag,
                    updatedAt: input.context.now,
                })
                .returning();
            return mapJob(job!, null);
        });
    }

    public async enqueueCardAuthoring(
        input: Parameters<DictionaryGenerationStore['enqueueCardAuthoring']>[0],
    ) {
        return this.database.transaction(async (tx) => {
            abort(input.context);
            await tx.execute(
                sql`select pg_advisory_xact_lock(${dictionaryGenerationAdmissionLock})`,
            );
            await tx
                .select({ id: usersTable.id })
                .from(usersTable)
                .where(eq(usersTable.id, input.ownerId))
                .for('update');
            abort(input.context);

            const [replay] = await tx
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
                            'card-authoring',
                        ),
                        eq(
                            dictionaryGenerationJobsTable.idempotencyKey,
                            input.idempotencyKey,
                        ),
                    ),
                )
                .limit(1)
                .for('share');
            if (replay) {
                if (replay.requestFingerprint !== input.fingerprint)
                    throw new DictionaryIdempotencyConflictError();
                return this.readView(tx, replay, input.context.now);
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
            if (!current) throw new DictionaryNotFoundError();
            if (
                current.dictionary.lifecycle !== 'active' ||
                current.dictionary.version !==
                    input.expectedDictionaryVersion ||
                current.settings.version !== input.expectedSettingsVersion
            )
                throw new DictionaryVersionConflictError();

            const overrides = domainOverrides(input.draft.overrides);
            assertCardSettingsOverrideTransition({
                dictionary: domainSettings(current.settings),
                next: overrides,
                previous: null,
            });
            const effectiveSettings = wireEffectiveSettingsForOverrides(
                current.settings,
                overrides,
            );
            const requestedFields = resolveDictionaryCardAuthoringFields(
                effectiveSettings,
                input.scope,
            );
            const eligibleFields = resolveDictionaryCardAuthoringFields(
                effectiveSettings,
                { kind: 'all' },
            );
            const excludedValues: Array<{
                field: (typeof requestedFields)[number];
                values: string[];
            }> = [];

            if (input.predecessor) {
                const predecessor = await this.lockOwnedJob(
                    tx,
                    input.ownerId,
                    input.predecessor.jobId,
                );
                if (
                    predecessor.kind !== 'card-authoring' ||
                    predecessor.format !==
                        dictionaryCardAuthoringGenerationFormat ||
                    predecessor.dictionaryId !== input.dictionaryId ||
                    predecessor.expectedDictionaryVersion !==
                        current.dictionary.version ||
                    predecessor.expectedSettingsVersion !==
                        current.settings.version ||
                    predecessor.sourceLanguageTag !==
                        current.dictionary.sourceLanguageTag ||
                    predecessor.targetLanguageTag !==
                        current.dictionary.targetLanguageTag
                )
                    throw new DictionaryGenerationNotReviewableError();
                const predecessorProposal = await this.lockProposal(
                    tx,
                    predecessor.id,
                );
                if (
                    !predecessorProposal ||
                    predecessorProposal.reviewState !== 'reviewable' ||
                    !predecessorProposal.payload
                )
                    throw new DictionaryGenerationNotReviewableError();
                if (predecessorProposal.expiresAt <= input.context.now)
                    throw new DictionaryGenerationProposalExpiredError();
                const stored =
                    DictionaryCardAuthoringProposalPayloadSchema.parse(
                        predecessorProposal.payload,
                    );
                const predecessorInput = predecessor.inputPayload
                    ? parseDictionaryGenerationInput(predecessor.inputPayload)
                    : null;
                if (
                    predecessorInput?.format !==
                        dictionaryCardAuthoringGenerationFormat ||
                    predecessorInput.source !== input.source ||
                    stored.source !== input.source
                )
                    throw new DictionaryGenerationCandidateConflictError();
                const availableIds = new Set(
                    stored.suggestions.map((suggestion) => suggestion.id),
                );
                const alreadyDiscardedIds = new Set(
                    predecessorInput.predecessor?.discardedSuggestionIds ?? [],
                );
                if (
                    input.predecessor.discardedSuggestionIds.some(
                        (id) =>
                            !availableIds.has(id) &&
                            !alreadyDiscardedIds.has(id),
                    )
                )
                    throw new DictionaryGenerationCandidateConflictError();
                const discarded = new Set(
                    input.predecessor.discardedSuggestionIds,
                );
                const historyFields = [
                    ...new Set([
                        ...eligibleFields,
                        ...predecessorInput.excludedValues.map(
                            (entry) => entry.field,
                        ),
                        ...stored.suggestions.map(
                            (suggestion) => suggestion.field,
                        ),
                    ]),
                ];
                for (const field of historyFields) {
                    const fieldSuggestions = stored.suggestions.filter(
                        (suggestion) => suggestion.field === field,
                    );
                    const remaining = fieldSuggestions.filter(
                        (suggestion) => !discarded.has(suggestion.id),
                    );
                    if (
                        requestedFields.includes(field) &&
                        remaining.length >=
                            dictionaryCardAuthoringSuggestionLimitPerField
                    )
                        throw new DictionaryGenerationCandidateConflictError();
                    const values = [
                        ...new Set([
                            ...(predecessorInput.excludedValues.find(
                                (entry) => entry.field === field,
                            )?.values ?? []),
                            ...fieldSuggestions.map(
                                (suggestion) => suggestion.value,
                            ),
                        ]),
                    ];
                    if (
                        values.length >
                        dictionaryCardAuthoringExcludedValueLimitPerField
                    )
                        throw new DictionaryGenerationCandidateConflictError();
                    if (values.length > 0)
                        excludedValues.push({ field, values });
                }
            }
            await this.assertGenerationAdmission(
                tx,
                input.ownerId,
                dictionaryCardAuthoringGenerationFormat,
                input.context.now,
            );
            abort(input.context);

            const payload =
                DictionaryCardAuthoringGenerationInputPayloadSchema.parse({
                    context: {
                        dictionaryId: current.dictionary.id,
                        expectedDictionaryVersion: current.dictionary.version,
                        expectedSettingsVersion: current.settings.version,
                        sourceLanguage: current.dictionary.sourceLanguageTag,
                        targetLanguage: current.dictionary.targetLanguageTag,
                    },
                    draft: input.draft,
                    effectiveSettings,
                    excludedValues,
                    format: dictionaryCardAuthoringGenerationFormat,
                    ...(input.predecessor
                        ? { predecessor: input.predecessor }
                        : {}),
                    scope: input.scope,
                    source: input.source,
                });
            const [job] = await tx
                .insert(dictionaryGenerationJobsTable)
                .values({
                    cardId: null,
                    createdAt: input.context.now,
                    dictionaryId: input.dictionaryId,
                    expectedCardVersion: null,
                    expectedDictionaryVersion: input.expectedDictionaryVersion,
                    expectedSettingsVersion: input.expectedSettingsVersion,
                    format: dictionaryCardAuthoringGenerationFormat,
                    id: this.ids.generate(),
                    idempotencyKey: input.idempotencyKey,
                    inputPayload: payload,
                    kind: 'card-authoring',
                    nextAttemptAt: input.context.now,
                    ownerId: input.ownerId,
                    providerReservationState: 'active',
                    providerInputCostMicrosPerMillionTokens:
                        this.providerBudget.inputCostMicrosPerMillionTokens,
                    providerMaxCostMicrosPerAttempt:
                        this.providerBudget.maxCostMicrosPerAttempt,
                    providerMaxInputTokensPerAttempt:
                        this.providerBudget.maxInputTokensPerAttempt,
                    providerMaxOutputTokensPerAttempt:
                        this.providerBudget.maxOutputTokensPerAttempt,
                    providerOutputCostMicrosPerMillionTokens:
                        this.providerBudget.outputCostMicrosPerMillionTokens,
                    providerReservedAttempts: 1,
                    providerReservedCostMicros:
                        this.providerBudget.maxCostMicrosPerAttempt,
                    providerReservedInputTokens:
                        this.providerBudget.maxInputTokensPerAttempt,
                    providerReservedOutputTokens:
                        this.providerBudget.maxOutputTokensPerAttempt,
                    requestFingerprint: input.fingerprint,
                    sourceLanguageTag: current.dictionary.sourceLanguageTag,
                    targetLanguageTag: current.dictionary.targetLanguageTag,
                    updatedAt: input.context.now,
                })
                .returning();
            return mapJob(job!, null);
        });
    }

    public async enqueuePastedTerms(
        input: Parameters<DictionaryGenerationStore['enqueuePastedTerms']>[0],
    ) {
        return this.database.transaction(async (tx) => {
            abort(input.context);
            await tx.execute(
                sql`select pg_advisory_xact_lock(${dictionaryGenerationAdmissionLock})`,
            );
            await tx
                .select({ id: usersTable.id })
                .from(usersTable)
                .where(eq(usersTable.id, input.ownerId))
                .for('update');
            abort(input.context);

            const [replay] = await tx
                .select()
                .from(dictionaryGenerationJobsTable)
                .where(
                    and(
                        eq(
                            dictionaryGenerationJobsTable.ownerId,
                            input.ownerId,
                        ),
                        eq(dictionaryGenerationJobsTable.kind, 'pasted-terms'),
                        eq(
                            dictionaryGenerationJobsTable.idempotencyKey,
                            input.idempotencyKey,
                        ),
                    ),
                )
                .limit(1)
                .for('share');
            if (replay) {
                if (replay.requestFingerprint !== input.fingerprint)
                    throw new DictionaryIdempotencyConflictError();
                return this.readView(tx, replay, input.context.now);
            }

            let rows;
            let sharedContext: string | null;
            let predecessor: {
                jobId: string;
                rowIndexes: number[];
            } | null = null;
            if (input.retry) {
                const priorJob = await this.lockOwnedJob(
                    tx,
                    input.ownerId,
                    input.retry.jobId,
                );
                if (
                    !['pasted-terms', 'document-terms'].includes(
                        priorJob.kind,
                    ) ||
                    priorJob.dictionaryId !== input.dictionaryId
                )
                    throw new DictionaryGenerationNotReviewableError();
                const priorProposal = await this.lockProposal(tx, priorJob.id);
                if (
                    !priorProposal ||
                    priorProposal.reviewState !== 'reviewable' ||
                    !priorProposal.payload ||
                    (priorJob.kind === 'document-terms' &&
                        (!priorProposal.documentStagedAt ||
                            !priorProposal.documentPublishedAt))
                )
                    throw new DictionaryGenerationNotReviewableError();
                if (priorProposal.expiresAt <= input.context.now) {
                    throw new DictionaryGenerationProposalExpiredError();
                }
                const priorInput = priorJob.inputPayload
                    ? parseDictionaryGenerationInput(priorJob.inputPayload)
                    : null;
                if (
                    (priorJob.kind === 'pasted-terms' &&
                        priorInput?.format !==
                            dictionaryPastedTermsGenerationFormat) ||
                    (priorJob.kind === 'document-terms' && priorInput !== null)
                )
                    throw new DictionaryGenerationNotReviewableError();
                const failures = new Map(
                    parseDictionaryBatchGenerationProposal(
                        priorProposal.payload,
                    )
                        .failures.filter((failure) => failure.retryable)
                        .map((failure) => [failure.rowIndex, failure.input]),
                );
                const rowIndexes = [...input.retry.rowIndexes].sort(
                    (left, right) => left - right,
                );
                const selectedInputs = rowIndexes.map((rowIndex) => {
                    const value = failures.get(rowIndex);
                    if (!value)
                        throw new DictionaryGenerationCandidateConflictError();
                    return value;
                });
                rows = selectedInputs.map((value, rowIndex) => ({
                    input: value,
                    rowIndex,
                }));
                sharedContext =
                    priorInput?.format === dictionaryPastedTermsGenerationFormat
                        ? priorInput.sharedContext
                        : null;
                predecessor = { jobId: priorJob.id, rowIndexes };
            } else {
                rows = parseDictionaryBatchGenerationText(input.text);
                sharedContext = input.sharedContext;
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
            if (!current) throw new DictionaryNotFoundError();
            if (
                current.dictionary.lifecycle !== 'active' ||
                current.dictionary.version !==
                    input.expectedDictionaryVersion ||
                current.settings.version !== input.expectedSettingsVersion
            )
                throw new DictionaryVersionConflictError();
            await this.assertGenerationAdmission(
                tx,
                input.ownerId,
                dictionaryPastedTermsGenerationFormat,
                input.context.now,
            );
            abort(input.context);

            const payload = parseDictionaryGenerationInput({
                context: {
                    dictionaryId: current.dictionary.id,
                    expectedDictionaryVersion: current.dictionary.version,
                    expectedSettingsVersion: current.settings.version,
                    sourceLanguage: current.dictionary.sourceLanguageTag,
                    targetLanguage: current.dictionary.targetLanguageTag,
                },
                effectiveSettings: wireEffectiveSettings(current.settings),
                format: dictionaryPastedTermsGenerationFormat,
                ...(predecessor ? { predecessor } : {}),
                rows,
                sharedContext,
            });
            const [job] = await tx
                .insert(dictionaryGenerationJobsTable)
                .values({
                    cardId: null,
                    createdAt: input.context.now,
                    dictionaryId: input.dictionaryId,
                    expectedCardVersion: null,
                    expectedDictionaryVersion: input.expectedDictionaryVersion,
                    expectedSettingsVersion: input.expectedSettingsVersion,
                    format: dictionaryPastedTermsGenerationFormat,
                    id: this.ids.generate(),
                    idempotencyKey: input.idempotencyKey,
                    inputPayload: payload,
                    kind: 'pasted-terms',
                    nextAttemptAt: input.context.now,
                    ownerId: input.ownerId,
                    providerReservationState: 'active',
                    providerInputCostMicrosPerMillionTokens:
                        this.providerBudget.inputCostMicrosPerMillionTokens,
                    providerMaxCostMicrosPerAttempt:
                        this.providerBudget.maxCostMicrosPerAttempt,
                    providerMaxInputTokensPerAttempt:
                        this.providerBudget.maxInputTokensPerAttempt,
                    providerMaxOutputTokensPerAttempt:
                        this.providerBudget.maxOutputTokensPerAttempt,
                    providerOutputCostMicrosPerMillionTokens:
                        this.providerBudget.outputCostMicrosPerMillionTokens,
                    providerReservedAttempts: 1,
                    providerReservedCostMicros:
                        this.providerBudget.maxCostMicrosPerAttempt,
                    providerReservedInputTokens:
                        this.providerBudget.maxInputTokensPerAttempt,
                    providerReservedOutputTokens:
                        this.providerBudget.maxOutputTokensPerAttempt,
                    requestFingerprint: input.fingerprint,
                    sourceLanguageTag: current.dictionary.sourceLanguageTag,
                    targetLanguageTag: current.dictionary.targetLanguageTag,
                    updatedAt: input.context.now,
                })
                .returning();
            return mapJob(job!, null);
        });
    }

    public async enqueueDocumentFailureRetry(
        input: Parameters<
            DictionaryGenerationStore['enqueueDocumentFailureRetry']
        >[0],
    ) {
        return this.enqueuePastedTerms({
            context: input.context,
            dictionaryId: input.dictionaryId,
            expectedDictionaryVersion: input.expectedDictionaryVersion,
            expectedSettingsVersion: input.expectedSettingsVersion,
            fingerprint: input.fingerprint,
            idempotencyKey: input.idempotencyKey,
            ownerId: input.ownerId,
            retry: {
                jobId: input.predecessorJobId,
                rowIndexes: input.rowIndexes,
            },
        });
    }

    public async enqueueImportPairs(
        input: Parameters<DictionaryGenerationStore['enqueueImportPairs']>[0],
    ) {
        return this.database.transaction(async (tx) => {
            abort(input.context);
            await tx.execute(
                sql`select pg_advisory_xact_lock(${dictionaryGenerationAdmissionLock})`,
            );
            const [owner] = await tx
                .select({ id: usersTable.id })
                .from(usersTable)
                .where(eq(usersTable.id, input.ownerId))
                .limit(1)
                .for('update');
            if (!owner) throw new DictionaryNotFoundError();

            await tx
                .delete(dictionaryIdempotencyKeysTable)
                .where(
                    and(
                        eq(
                            dictionaryIdempotencyKeysTable.ownerId,
                            input.ownerId,
                        ),
                        eq(
                            dictionaryIdempotencyKeysTable.operation,
                            'bulk_commit',
                        ),
                        eq(
                            dictionaryIdempotencyKeysTable.idempotencyKey,
                            input.idempotencyKey,
                        ),
                        lte(
                            dictionaryIdempotencyKeysTable.expiresAt,
                            input.context.now,
                        ),
                    ),
                );
            await tx.execute(sql`
                delete from ${dictionaryIdempotencyKeysTable}
                where ${dictionaryIdempotencyKeysTable.id} in (
                    select ${dictionaryIdempotencyKeysTable.id}
                    from ${dictionaryIdempotencyKeysTable}
                    where ${dictionaryIdempotencyKeysTable.expiresAt} <= ${input.context.now.toISOString()}::timestamptz
                    order by ${dictionaryIdempotencyKeysTable.expiresAt}
                    limit 100
                    for update skip locked
                )
            `);
            const [reserved] = await tx
                .insert(dictionaryIdempotencyKeysTable)
                .values({
                    createdAt: input.context.now,
                    expiresAt: new Date(
                        input.context.now.getTime() + bulkIdempotencyLifetimeMs,
                    ),
                    id: this.ids.generate(),
                    idempotencyKey: input.idempotencyKey,
                    operation: 'bulk_commit',
                    ownerId: input.ownerId,
                    requestFingerprint: input.fingerprint,
                    updatedAt: input.context.now,
                })
                .onConflictDoNothing({
                    target: [
                        dictionaryIdempotencyKeysTable.ownerId,
                        dictionaryIdempotencyKeysTable.operation,
                        dictionaryIdempotencyKeysTable.idempotencyKey,
                    ],
                })
                .returning({ id: dictionaryIdempotencyKeysTable.id });
            if (!reserved) {
                const [existing] = await tx
                    .select()
                    .from(dictionaryIdempotencyKeysTable)
                    .where(
                        and(
                            eq(
                                dictionaryIdempotencyKeysTable.ownerId,
                                input.ownerId,
                            ),
                            eq(
                                dictionaryIdempotencyKeysTable.operation,
                                'bulk_commit',
                            ),
                            eq(
                                dictionaryIdempotencyKeysTable.idempotencyKey,
                                input.idempotencyKey,
                            ),
                        ),
                    )
                    .limit(1)
                    .for('update');
                if (
                    !existing ||
                    existing.requestFingerprint !== input.fingerprint ||
                    existing.state !== 'completed' ||
                    !existing.resultPayload
                )
                    throw new DictionaryIdempotencyConflictError();
                const replay = DictionaryAiImportResponseSchema.safeParse(
                    existing.resultPayload,
                );
                if (!replay.success)
                    throw new DictionaryIdempotencyConflictError();
                return replay.data;
            }

            let current: {
                dictionary: typeof dictionariesTable.$inferSelect;
                settings: SettingsRow;
            };
            if (input.target.kind === 'new') {
                const [dictionaryCount] = await tx
                    .select({ value: count() })
                    .from(dictionariesTable)
                    .where(eq(dictionariesTable.ownerId, input.ownerId));
                const [cardCount] = await tx
                    .select({ value: count() })
                    .from(dictionaryCardsTable)
                    .innerJoin(
                        dictionariesTable,
                        eq(
                            dictionaryCardsTable.dictionaryId,
                            dictionariesTable.id,
                        ),
                    )
                    .where(eq(dictionariesTable.ownerId, input.ownerId));
                const [revisionCount] = await tx
                    .select({ value: count() })
                    .from(dictionaryCardRevisionsTable)
                    .innerJoin(
                        dictionariesTable,
                        eq(
                            dictionaryCardRevisionsTable.dictionaryId,
                            dictionariesTable.id,
                        ),
                    )
                    .where(eq(dictionariesTable.ownerId, input.ownerId));
                assertDictionaryOwnerCapacity(
                    {
                        cards: Number(cardCount?.value ?? 0),
                        dictionaries: Number(dictionaryCount?.value ?? 0),
                        revisions: Number(revisionCount?.value ?? 0),
                    },
                    { cards: 0, dictionaries: 1, revisions: 0 },
                    dictionaryLimits,
                );
                const details = normalizeDictionaryDetails(input.target);
                const dictionaryId = this.ids.generate();
                const [dictionary] = await tx
                    .insert(dictionariesTable)
                    .values({
                        createdAt: input.context.now,
                        description: details.description,
                        id: dictionaryId,
                        name: details.name,
                        ownerId: input.ownerId,
                        sourceLanguageTag: input.target.sourceLanguage,
                        targetLanguageTag: input.target.targetLanguage,
                        updatedAt: input.context.now,
                    })
                    .returning();
                const [settings] = await tx
                    .insert(dictionarySettingsTable)
                    .values({
                        createdAt: input.context.now,
                        customNotationLabel:
                            defaultDictionarySettings.customNotationLabel,
                        definitionEnabled:
                            defaultDictionarySettings.definitionEnabled,
                        definitionLanguageRole:
                            defaultDictionarySettings.definitionLanguageRole,
                        dictionaryId,
                        exampleEnabled:
                            defaultDictionarySettings.exampleEnabled,
                        exampleLanguageRole:
                            defaultDictionarySettings.exampleLanguageRole,
                        exampleTranslationEnabled:
                            defaultDictionarySettings.exampleTranslationEnabled,
                        transcriptionEnabled:
                            defaultDictionarySettings.transcriptionEnabled,
                        transcriptionNotation:
                            defaultDictionarySettings.transcriptionNotation,
                        updatedAt: input.context.now,
                    })
                    .returning();
                if (!dictionary || !settings)
                    throw new DictionaryVersionConflictError();
                current = { dictionary, settings };
            } else {
                const [existing] = await tx
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
                            eq(dictionariesTable.id, input.target.dictionaryId),
                            eq(dictionariesTable.ownerId, input.ownerId),
                        ),
                    )
                    .limit(1)
                    .for('update', { of: dictionariesTable });
                if (!existing) throw new DictionaryNotFoundError();
                await tx
                    .select({
                        dictionaryId: dictionarySettingsTable.dictionaryId,
                    })
                    .from(dictionarySettingsTable)
                    .where(
                        eq(
                            dictionarySettingsTable.dictionaryId,
                            existing.dictionary.id,
                        ),
                    )
                    .limit(1)
                    .for('update');
                if (
                    existing.dictionary.lifecycle !== 'active' ||
                    existing.dictionary.version !==
                        input.target.expectedDictionaryVersion ||
                    existing.settings.version !==
                        input.target.expectedSettingsVersion
                )
                    throw new DictionaryVersionConflictError();
                current = existing;
            }

            const effectiveSettings = wireEffectiveSettings(current.settings);
            if (
                !effectiveSettings.transcriptionEnabled &&
                !effectiveSettings.definitionEnabled &&
                !effectiveSettings.exampleEnabled &&
                !effectiveSettings.exampleTranslationEnabled
            )
                throw new DictionaryGenerationNotAvailableError();

            await this.assertGenerationAdmission(
                tx,
                input.ownerId,
                dictionaryImportPairsGenerationFormat,
                input.context.now,
            );
            abort(input.context);
            const payload = parseDictionaryGenerationInput({
                context: {
                    dictionaryId: current.dictionary.id,
                    expectedDictionaryVersion: current.dictionary.version,
                    expectedSettingsVersion: current.settings.version,
                    sourceLanguage: current.dictionary.sourceLanguageTag,
                    targetLanguage: current.dictionary.targetLanguageTag,
                },
                effectiveSettings,
                format: dictionaryImportPairsGenerationFormat,
                importFingerprint: input.importFingerprint,
                instruction: input.instruction,
                rows: input.rows.map((row) => ({
                    lineage: {
                        importFingerprint: input.importFingerprint,
                        importedRowIndex: row.rowIndex,
                    },
                    ...row,
                })),
            });
            const [job] = await tx
                .insert(dictionaryGenerationJobsTable)
                .values({
                    cardId: null,
                    createdAt: input.context.now,
                    dictionaryId: current.dictionary.id,
                    expectedCardVersion: null,
                    expectedDictionaryVersion: current.dictionary.version,
                    expectedSettingsVersion: current.settings.version,
                    format: dictionaryImportPairsGenerationFormat,
                    id: this.ids.generate(),
                    idempotencyKey: input.idempotencyKey,
                    inputPayload: payload,
                    kind: 'import-pairs',
                    nextAttemptAt: input.context.now,
                    ownerId: input.ownerId,
                    providerReservationState: 'active',
                    providerInputCostMicrosPerMillionTokens:
                        this.providerBudget.inputCostMicrosPerMillionTokens,
                    providerMaxCostMicrosPerAttempt:
                        this.providerBudget.maxCostMicrosPerAttempt,
                    providerMaxInputTokensPerAttempt:
                        this.providerBudget.maxInputTokensPerAttempt,
                    providerMaxOutputTokensPerAttempt:
                        this.providerBudget.maxOutputTokensPerAttempt,
                    providerOutputCostMicrosPerMillionTokens:
                        this.providerBudget.outputCostMicrosPerMillionTokens,
                    providerReservedAttempts: 1,
                    providerReservedCostMicros:
                        this.providerBudget.maxCostMicrosPerAttempt,
                    providerReservedInputTokens:
                        this.providerBudget.maxInputTokensPerAttempt,
                    providerReservedOutputTokens:
                        this.providerBudget.maxOutputTokensPerAttempt,
                    requestFingerprint: input.fingerprint,
                    sourceLanguageTag: current.dictionary.sourceLanguageTag,
                    targetLanguageTag: current.dictionary.targetLanguageTag,
                    updatedAt: input.context.now,
                })
                .returning();
            if (!job) throw new DictionaryVersionConflictError();
            const [counts] = await tx
                .select({
                    active: sql<number>`count(*) filter (where ${dictionaryCardsTable.lifecycle} = 'active')`,
                    retained: count(),
                })
                .from(dictionaryCardsTable)
                .where(
                    eq(
                        dictionaryCardsTable.dictionaryId,
                        current.dictionary.id,
                    ),
                );
            const response = DictionaryAiImportResponseSchema.parse({
                dictionary: mapOwnedDictionary(
                    current.dictionary,
                    current.settings,
                    Number(counts?.active ?? 0),
                    Number(counts?.retained ?? 0),
                ),
                job: mapJob(job, null),
                mode: 'ai',
            });
            const completed = await tx
                .update(dictionaryIdempotencyKeysTable)
                .set({
                    completedAt: input.context.now,
                    resultDictionaryId: current.dictionary.id,
                    resultPayload: response,
                    state: 'completed',
                    updatedAt: input.context.now,
                })
                .where(
                    and(
                        eq(dictionaryIdempotencyKeysTable.id, reserved.id),
                        eq(dictionaryIdempotencyKeysTable.state, 'in_progress'),
                    ),
                )
                .returning({ id: dictionaryIdempotencyKeysTable.id });
            if (completed.length !== 1)
                throw new DictionaryIdempotencyConflictError();
            return response;
        });
    }

    public async enqueueImportPairsRetry(
        input: Parameters<
            DictionaryGenerationStore['enqueueImportPairsRetry']
        >[0],
    ) {
        return this.database.transaction(async (tx) => {
            abort(input.context);
            await tx.execute(
                sql`select pg_advisory_xact_lock(${dictionaryGenerationAdmissionLock})`,
            );
            const [owner] = await tx
                .select({ id: usersTable.id })
                .from(usersTable)
                .where(eq(usersTable.id, input.ownerId))
                .limit(1)
                .for('update');
            if (!owner) throw new DictionaryNotFoundError();
            const [replay] = await tx
                .select()
                .from(dictionaryGenerationJobsTable)
                .where(
                    and(
                        eq(
                            dictionaryGenerationJobsTable.ownerId,
                            input.ownerId,
                        ),
                        eq(dictionaryGenerationJobsTable.kind, 'import-pairs'),
                        eq(
                            dictionaryGenerationJobsTable.idempotencyKey,
                            input.idempotencyKey,
                        ),
                    ),
                )
                .limit(1)
                .for('share');
            if (replay) {
                if (replay.requestFingerprint !== input.fingerprint)
                    throw new DictionaryIdempotencyConflictError();
                return this.readView(tx, replay, input.context.now);
            }

            const predecessor = await this.lockOwnedJob(
                tx,
                input.ownerId,
                input.predecessorJobId,
            );
            if (
                predecessor.kind !== 'import-pairs' ||
                !predecessor.inputPayload
            )
                throw new DictionaryGenerationNotReviewableError();
            const predecessorInput = parseDictionaryGenerationInput(
                predecessor.inputPayload,
            );
            const predecessorProposal = await this.lockProposal(
                tx,
                predecessor.id,
            );
            if (
                predecessorInput.format !==
                    dictionaryImportPairsGenerationFormat ||
                !predecessorProposal?.payload ||
                predecessorProposal.reviewState !== 'reviewable'
            )
                throw new DictionaryGenerationNotReviewableError();
            if (predecessorProposal.expiresAt <= input.context.now)
                throw new DictionaryGenerationProposalExpiredError();
            const retryableFailures = new Set(
                parseDictionaryImportPairsGenerationProposal(
                    predecessorProposal.payload,
                )
                    .failures.filter((failure) => failure.retryable)
                    .map((failure) => failure.rowIndex),
            );
            const persistedRows = new Map(
                predecessorInput.rows.map(
                    (row) => [row.rowIndex, row] as const,
                ),
            );
            const rowIndexes = [...input.rowIndexes].sort(
                (left, right) => left - right,
            );
            const rows = rowIndexes.map((rowIndex) => {
                const row = persistedRows.get(rowIndex);
                if (!row || !retryableFailures.has(rowIndex))
                    throw new DictionaryGenerationCandidateConflictError();
                return row;
            });

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
                        eq(dictionariesTable.id, predecessor.dictionaryId),
                        eq(dictionariesTable.ownerId, input.ownerId),
                    ),
                )
                .limit(1)
                .for('update', { of: dictionariesTable });
            if (!current) throw new DictionaryNotFoundError();
            await tx
                .select({ dictionaryId: dictionarySettingsTable.dictionaryId })
                .from(dictionarySettingsTable)
                .where(
                    eq(
                        dictionarySettingsTable.dictionaryId,
                        current.dictionary.id,
                    ),
                )
                .limit(1)
                .for('update');
            if (
                current.dictionary.lifecycle !== 'active' ||
                current.dictionary.version !==
                    input.expectedDictionaryVersion ||
                current.settings.version !== input.expectedSettingsVersion ||
                current.dictionary.sourceLanguageTag !==
                    predecessor.sourceLanguageTag ||
                current.dictionary.targetLanguageTag !==
                    predecessor.targetLanguageTag
            )
                throw new DictionaryVersionConflictError();
            await this.assertGenerationAdmission(
                tx,
                input.ownerId,
                dictionaryImportPairsGenerationFormat,
                input.context.now,
            );
            const payload = parseDictionaryGenerationInput({
                context: {
                    dictionaryId: current.dictionary.id,
                    expectedDictionaryVersion: current.dictionary.version,
                    expectedSettingsVersion: current.settings.version,
                    sourceLanguage: current.dictionary.sourceLanguageTag,
                    targetLanguage: current.dictionary.targetLanguageTag,
                },
                effectiveSettings: wireEffectiveSettings(current.settings),
                format: dictionaryImportPairsGenerationFormat,
                importFingerprint: predecessorInput.importFingerprint,
                instruction: predecessorInput.instruction,
                predecessor: {
                    jobId: predecessor.id,
                    rowIndexes,
                },
                rows,
            });
            const [job] = await tx
                .insert(dictionaryGenerationJobsTable)
                .values({
                    cardId: null,
                    createdAt: input.context.now,
                    dictionaryId: current.dictionary.id,
                    expectedCardVersion: null,
                    expectedDictionaryVersion: current.dictionary.version,
                    expectedSettingsVersion: current.settings.version,
                    format: dictionaryImportPairsGenerationFormat,
                    id: this.ids.generate(),
                    idempotencyKey: input.idempotencyKey,
                    inputPayload: payload,
                    kind: 'import-pairs',
                    nextAttemptAt: input.context.now,
                    ownerId: input.ownerId,
                    providerReservationState: 'active',
                    providerInputCostMicrosPerMillionTokens:
                        this.providerBudget.inputCostMicrosPerMillionTokens,
                    providerMaxCostMicrosPerAttempt:
                        this.providerBudget.maxCostMicrosPerAttempt,
                    providerMaxInputTokensPerAttempt:
                        this.providerBudget.maxInputTokensPerAttempt,
                    providerMaxOutputTokensPerAttempt:
                        this.providerBudget.maxOutputTokensPerAttempt,
                    providerOutputCostMicrosPerMillionTokens:
                        this.providerBudget.outputCostMicrosPerMillionTokens,
                    providerReservedAttempts: 1,
                    providerReservedCostMicros:
                        this.providerBudget.maxCostMicrosPerAttempt,
                    providerReservedInputTokens:
                        this.providerBudget.maxInputTokensPerAttempt,
                    providerReservedOutputTokens:
                        this.providerBudget.maxOutputTokensPerAttempt,
                    requestFingerprint: input.fingerprint,
                    sourceLanguageTag: current.dictionary.sourceLanguageTag,
                    targetLanguageTag: current.dictionary.targetLanguageTag,
                    updatedAt: input.context.now,
                })
                .returning();
            if (!job) throw new DictionaryVersionConflictError();
            return mapJob(job, null);
        });
    }

    public async read(input: Parameters<DictionaryGenerationStore['read']>[0]) {
        return this.database.transaction(async (tx) => {
            abort(input.context);
            const [job] = await tx
                .select()
                .from(dictionaryGenerationJobsTable)
                .where(
                    and(
                        eq(dictionaryGenerationJobsTable.id, input.jobId),
                        eq(
                            dictionaryGenerationJobsTable.ownerId,
                            input.ownerId,
                        ),
                    ),
                )
                .limit(1)
                .for('share');
            if (!job) throw new DictionaryGenerationJobNotFoundError();
            return this.readView(tx, job, input.context.now);
        });
    }

    public async latestForCard(
        input: Parameters<DictionaryGenerationStore['latestForCard']>[0],
    ) {
        return this.database.transaction(async (tx) => {
            abort(input.context);
            const [job] = await tx
                .select()
                .from(dictionaryGenerationJobsTable)
                .where(
                    and(
                        eq(
                            dictionaryGenerationJobsTable.ownerId,
                            input.ownerId,
                        ),
                        eq(
                            dictionaryGenerationJobsTable.dictionaryId,
                            input.dictionaryId,
                        ),
                        eq(dictionaryGenerationJobsTable.cardId, input.cardId),
                    ),
                )
                .orderBy(
                    desc(dictionaryGenerationJobsTable.createdAt),
                    desc(dictionaryGenerationJobsTable.id),
                )
                .limit(1)
                .for('share');
            return job ? this.readView(tx, job, input.context.now) : null;
        });
    }

    public async cancel(
        input: Parameters<DictionaryGenerationStore['cancel']>[0],
    ) {
        return this.database.transaction(async (tx) => {
            abort(input.context);
            const job = await this.lockOwnedJob(tx, input.ownerId, input.jobId);
            abort(input.context);
            if (job.executionState === 'cancelled')
                return this.readView(tx, job, input.context.now);
            if (!['queued', 'running'].includes(job.executionState))
                throw new DictionaryGenerationNotAvailableError();
            if (job.executionState === 'running' && job.cancellationRequestedAt)
                return this.readView(tx, job, input.context.now);
            const queued = job.executionState === 'queued';
            const incurredProviderCost = queued && job.attemptCount > 0;
            const [updated] = await tx
                .update(dictionaryGenerationJobsTable)
                .set({
                    awaitingUploadAt: queued ? null : job.awaitingUploadAt,
                    cancellationRequestedAt: input.context.now,
                    completedAt: queued ? input.context.now : null,
                    executionState: queued ? 'cancelled' : 'running',
                    inputPayload: queued ? null : job.inputPayload,
                    progressPercent: queued ? 100 : job.progressPercent,
                    progressStage: queued ? 'terminal' : job.progressStage,
                    providerActualCostMicros: queued
                        ? incurredProviderCost
                            ? job.providerReservedCostMicros
                            : 0
                        : null,
                    providerActualInputTokens: queued
                        ? incurredProviderCost
                            ? job.providerReservedInputTokens
                            : 0
                        : null,
                    providerActualOutputTokens: queued
                        ? incurredProviderCost
                            ? job.providerReservedOutputTokens
                            : 0
                        : null,
                    providerReservationSettledAt: queued
                        ? input.context.now
                        : null,
                    providerReservationState: queued
                        ? incurredProviderCost
                            ? 'settled'
                            : 'released'
                        : 'active',
                    updatedAt: input.context.now,
                })
                .where(
                    and(
                        eq(dictionaryGenerationJobsTable.id, job.id),
                        inArray(dictionaryGenerationJobsTable.executionState, [
                            'queued',
                            'running',
                        ]),
                    ),
                )
                .returning();
            if (queued && job.kind === 'document-terms')
                await tx
                    .update(dictionaryGenerationProposalsTable)
                    .set({
                        payload: null,
                        reviewState: 'discarded',
                        terminalAt: input.context.now,
                        updatedAt: input.context.now,
                    })
                    .where(
                        and(
                            eq(
                                dictionaryGenerationProposalsTable.jobId,
                                job.id,
                            ),
                            isNotNull(
                                dictionaryGenerationProposalsTable.documentStagedAt,
                            ),
                            isNull(
                                dictionaryGenerationProposalsTable.documentPublishedAt,
                            ),
                            eq(
                                dictionaryGenerationProposalsTable.reviewState,
                                'reviewable',
                            ),
                        ),
                    );
            if (queued && job.kind === 'document-terms')
                await this.scheduleDocumentCleanup(
                    tx,
                    job.id,
                    input.context.now,
                    'cancelled',
                );
            return this.readView(tx, updated!, input.context.now);
        });
    }

    public async discard(
        input: Parameters<DictionaryGenerationStore['discard']>[0],
    ) {
        const result = await this.database.transaction(async (tx) => {
            abort(input.context);
            const job = await this.lockOwnedJob(tx, input.ownerId, input.jobId);
            const proposal = await this.lockProposal(tx, job.id);
            abort(input.context);
            if (proposal?.reviewState === 'discarded')
                return {
                    expired: false as const,
                    value: await this.readView(tx, job, input.context.now),
                };
            if (proposal?.reviewState === 'expired')
                return { expired: true as const };
            if (!proposal || proposal.reviewState !== 'reviewable')
                throw new DictionaryGenerationNotReviewableError();
            if (proposal.documentStagedAt && !proposal.documentPublishedAt)
                throw new DictionaryGenerationNotReviewableError();
            if (proposal.expiresAt <= input.context.now) {
                await this.expireProposal(tx, job.id, input.context.now);
                return { expired: true as const };
            }
            abort(input.context);
            await tx
                .update(dictionaryGenerationProposalsTable)
                .set({
                    payload: null,
                    reviewState: 'discarded',
                    terminalAt: input.context.now,
                    updatedAt: input.context.now,
                })
                .where(eq(dictionaryGenerationProposalsTable.jobId, job.id));
            await tx
                .update(dictionaryGenerationJobsTable)
                .set({ inputPayload: null, updatedAt: input.context.now })
                .where(eq(dictionaryGenerationJobsTable.id, job.id));
            return {
                expired: false as const,
                value: await this.readView(tx, job, input.context.now),
            };
        });
        if (result.expired)
            throw new DictionaryGenerationProposalExpiredError();
        return result.value;
    }

    public async acceptSingleCard(
        input: Parameters<DictionaryGenerationStore['acceptSingleCard']>[0],
    ) {
        const result = await this.database.transaction(async (tx) => {
            abort(input.context);
            await tx.execute(
                sql`select pg_advisory_xact_lock(${dictionaryGenerationAdmissionLock})`,
            );
            abort(input.context);
            await tx
                .select({ id: usersTable.id })
                .from(usersTable)
                .where(eq(usersTable.id, input.ownerId))
                .for('update');
            abort(input.context);
            const job = await this.lockOwnedJob(tx, input.ownerId, input.jobId);
            if (job.kind !== 'single-card')
                throw new DictionaryGenerationNotReviewableError();
            const proposal = await this.lockProposal(tx, job.id);
            abort(input.context);
            if (!proposal) throw new DictionaryGenerationNotReviewableError();
            if (proposal.reviewState === 'accepted') {
                if (
                    proposal.acceptedCandidateFingerprint !==
                    input.candidateFingerprint
                )
                    throw new DictionaryGenerationCandidateConflictError();
                const acceptedJob = await this.readView(
                    tx,
                    job,
                    input.context.now,
                );
                if (acceptedJob.kind !== 'single-card' || !acceptedJob.outcome)
                    throw new DictionaryGenerationCandidateConflictError();
                return {
                    expired: false as const,
                    value: { job: acceptedJob, outcome: acceptedJob.outcome },
                };
            }
            if (proposal.reviewState === 'expired')
                return { expired: true as const };
            if (proposal.reviewState !== 'reviewable' || !proposal.payload)
                throw new DictionaryGenerationNotReviewableError();
            if (proposal.documentStagedAt && !proposal.documentPublishedAt)
                throw new DictionaryGenerationNotReviewableError();
            if (proposal.expiresAt <= input.context.now) {
                await this.expireProposal(tx, job.id, input.context.now);
                return { expired: true as const };
            }
            const storedProposal = parseDictionaryGenerationProposal(
                proposal.payload,
            );
            const candidate = parseDictionaryGenerationProposal({
                ...storedProposal,
                candidate: input.candidate,
            }).candidate;
            const current = await this.lockCardSnapshot(tx, job);
            abort(input.context);
            if (
                current.dictionary.lifecycle !== 'active' ||
                current.card.lifecycle !== 'active' ||
                current.dictionary.version !== job.expectedDictionaryVersion ||
                current.settings.version !== job.expectedSettingsVersion ||
                current.card.version !== job.expectedCardVersion ||
                current.dictionary.sourceLanguageTag !==
                    job.sourceLanguageTag ||
                current.dictionary.targetLanguageTag !== job.targetLanguageTag
            )
                throw new DictionaryVersionConflictError();

            const candidateOverrides = domainOverrides(candidate.overrides);
            assertCardSettingsOverrideTransition({
                dictionary: domainSettings(current.settings),
                next: candidateOverrides,
                previous: domainOverrides(wireOverrides(current.card)),
            });
            const candidateValues = normalizeCardValues(candidate.values);
            const semanticChange = !areCardSemanticStatesEqual(
                {
                    overrides: domainOverrides(wireOverrides(current.card)),
                    values: values(current.card),
                },
                { overrides: candidateOverrides, values: candidateValues },
            );
            const proposalEdited = !areCardSemanticStatesEqual(
                {
                    overrides: domainOverrides(
                        storedProposal.candidate.overrides,
                    ),
                    values: storedProposal.candidate.values,
                },
                { overrides: candidateOverrides, values: candidateValues },
            );
            const authorship = resolveCardMutationAuthorship({
                mutationKind: 'ai_proposal_accept',
                prior: current.card.authorship,
                proposalEdited,
                semanticChange,
            }).authorship;

            let card = current.card;
            let dictionaryVersion = current.dictionary.version;
            let revisionId: string;
            if (semanticChange) {
                const [ownerRevisionCount] = await tx
                    .select({ value: count() })
                    .from(dictionaryCardRevisionsTable)
                    .innerJoin(
                        dictionariesTable,
                        eq(
                            dictionariesTable.id,
                            dictionaryCardRevisionsTable.dictionaryId,
                        ),
                    )
                    .where(eq(dictionariesTable.ownerId, input.ownerId));
                if (Number(ownerRevisionCount?.value ?? 0) >= 250_000)
                    throw new DictionaryGenerationNotAvailableError();
                abort(input.context);
                const [updatedCard] = await tx
                    .update(dictionaryCardsTable)
                    .set({
                        authorship,
                        customNotationLabelOverride:
                            candidateOverrides.customNotationLabel,
                        definition: candidateValues.definition,
                        definitionEnabledOverride:
                            candidateOverrides.definitionEnabled,
                        definitionLanguageRoleOverride:
                            candidateOverrides.definitionLanguageRole,
                        example: candidateValues.example,
                        exampleEnabledOverride:
                            candidateOverrides.exampleEnabled,
                        exampleLanguageRoleOverride:
                            candidateOverrides.exampleLanguageRole,
                        exampleTranslation: candidateValues.exampleTranslation,
                        exampleTranslationEnabledOverride:
                            candidateOverrides.exampleTranslationEnabled,
                        normalizedSource:
                            normalizeDictionaryCardSourceForSearch(
                                candidateValues.source,
                            ),
                        source: candidateValues.source,
                        transcription: candidateValues.transcription,
                        transcriptionEnabledOverride:
                            candidateOverrides.transcriptionEnabled,
                        transcriptionNotationOverride:
                            candidateOverrides.transcriptionNotation,
                        translation: candidateValues.translation,
                        updatedAt: input.context.now,
                        version: current.card.version + 1,
                    })
                    .where(
                        and(
                            eq(dictionaryCardsTable.id, current.card.id),
                            eq(
                                dictionaryCardsTable.version,
                                current.card.version,
                            ),
                        ),
                    )
                    .returning();
                if (!updatedCard) throw new DictionaryVersionConflictError();
                card = updatedCard;
                revisionId = this.ids.generate();
                await tx.insert(dictionaryCardRevisionsTable).values({
                    acceptedGenerationJobId: job.id,
                    actorUserId: input.ownerId,
                    authorship: card.authorship,
                    cardId: card.id,
                    cardVersion: card.version,
                    createdAt: input.context.now,
                    dictionaryId: card.dictionaryId,
                    id: revisionId,
                    mutationKind: 'ai_proposal_accept',
                    revisionNumber: card.version,
                    schemaVersion: 1,
                    settingsVersion: current.settings.version,
                    snapshot: revisionSnapshot(card, current.settings),
                });
                const [updatedDictionary] = await tx
                    .update(dictionariesTable)
                    .set({
                        updatedAt: input.context.now,
                        version: current.dictionary.version + 1,
                    })
                    .where(
                        and(
                            eq(dictionariesTable.id, current.dictionary.id),
                            eq(
                                dictionariesTable.version,
                                current.dictionary.version,
                            ),
                        ),
                    )
                    .returning({ version: dictionariesTable.version });
                if (!updatedDictionary)
                    throw new DictionaryVersionConflictError();
                dictionaryVersion = updatedDictionary.version;
            } else {
                const [currentRevision] = await tx
                    .select({ id: dictionaryCardRevisionsTable.id })
                    .from(dictionaryCardRevisionsTable)
                    .where(
                        and(
                            eq(
                                dictionaryCardRevisionsTable.cardId,
                                current.card.id,
                            ),
                            eq(
                                dictionaryCardRevisionsTable.cardVersion,
                                current.card.version,
                            ),
                        ),
                    )
                    .limit(1);
                if (!currentRevision)
                    throw new DictionaryGenerationCandidateConflictError();
                revisionId = currentRevision.id;
            }

            abort(input.context);
            await tx
                .update(dictionaryGenerationProposalsTable)
                .set({
                    acceptedCandidateFingerprint: input.candidateFingerprint,
                    acceptedCardVersion: card.version,
                    acceptedDictionaryVersion: dictionaryVersion,
                    acceptedRevisionId: revisionId,
                    payload: null,
                    reviewState: 'accepted',
                    terminalAt: input.context.now,
                    updatedAt: input.context.now,
                })
                .where(eq(dictionaryGenerationProposalsTable.jobId, job.id));
            await tx
                .update(dictionaryGenerationJobsTable)
                .set({ inputPayload: null, updatedAt: input.context.now })
                .where(eq(dictionaryGenerationJobsTable.id, job.id));
            const acceptedJob = await this.readView(tx, job, input.context.now);
            if (acceptedJob.kind !== 'single-card' || !acceptedJob.outcome)
                throw new DictionaryGenerationCandidateConflictError();
            return {
                expired: false as const,
                value: { job: acceptedJob, outcome: acceptedJob.outcome },
            };
        });
        if (result.expired)
            throw new DictionaryGenerationProposalExpiredError();
        return result.value;
    }

    public async acceptCardAuthoring(
        input: Parameters<DictionaryGenerationStore['acceptCardAuthoring']>[0],
    ) {
        const result = await this.database.transaction(async (tx) => {
            abort(input.context);
            await tx.execute(
                sql`select pg_advisory_xact_lock(${dictionaryGenerationAdmissionLock})`,
            );
            await tx
                .select({ id: usersTable.id })
                .from(usersTable)
                .where(eq(usersTable.id, input.ownerId))
                .for('update');
            const job = await this.lockOwnedJob(tx, input.ownerId, input.jobId);
            if (job.kind !== 'card-authoring')
                throw new DictionaryGenerationNotReviewableError();
            const proposal = await this.lockProposal(tx, job.id);
            if (!proposal) throw new DictionaryGenerationNotReviewableError();
            if (proposal.reviewState === 'accepted') {
                if (
                    proposal.acceptedCandidateFingerprint !==
                    input.acceptanceFingerprint
                )
                    throw new DictionaryGenerationCandidateConflictError();
                const acceptedJob = await this.readView(
                    tx,
                    job,
                    input.context.now,
                );
                if (
                    acceptedJob.kind !== 'card-authoring' ||
                    !acceptedJob.outcome
                )
                    throw new DictionaryGenerationCandidateConflictError();
                return {
                    expired: false as const,
                    value: {
                        job: acceptedJob,
                        outcome: acceptedJob.outcome,
                    },
                };
            }
            if (proposal.reviewState === 'expired')
                return { expired: true as const };
            if (proposal.reviewState !== 'reviewable' || !proposal.payload)
                throw new DictionaryGenerationNotReviewableError();
            if (proposal.expiresAt <= input.context.now) {
                await this.expireProposal(tx, job.id, input.context.now);
                return { expired: true as const };
            }

            const stored = DictionaryCardAuthoringProposalPayloadSchema.parse(
                proposal.payload,
            );
            const candidateValues = normalizeCardValues(input.candidate.values);
            const aiAssisted = input.selectedSuggestions.length > 0;
            if (aiAssisted && candidateValues.source !== stored.source)
                throw new DictionaryGenerationCandidateConflictError();
            const suggestionsById = new Map(
                stored.suggestions.map((suggestion) => [
                    suggestion.id,
                    suggestion,
                ]),
            );
            for (const selected of input.selectedSuggestions) {
                const suggestion = suggestionsById.get(selected.suggestionId);
                if (
                    !suggestion ||
                    suggestion.field !== selected.field ||
                    candidateValues[selected.field] !== suggestion.value
                )
                    throw new DictionaryGenerationCandidateConflictError();
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
                        eq(dictionariesTable.id, job.dictionaryId),
                        eq(dictionariesTable.ownerId, input.ownerId),
                    ),
                )
                .for('update');
            if (!current) throw new DictionaryGenerationJobNotFoundError();
            if (
                current.dictionary.lifecycle !== 'active' ||
                current.dictionary.version !== job.expectedDictionaryVersion ||
                current.settings.version !== job.expectedSettingsVersion ||
                current.dictionary.sourceLanguageTag !==
                    job.sourceLanguageTag ||
                current.dictionary.targetLanguageTag !== job.targetLanguageTag
            )
                throw new DictionaryVersionConflictError();
            const candidateOverrides = domainOverrides(
                input.candidate.overrides,
            );
            assertCardSettingsOverrideTransition({
                dictionary: domainSettings(current.settings),
                next: candidateOverrides,
                previous: null,
            });

            const [cardState] = await tx
                .select({
                    active: sql<number>`count(*) filter (where ${dictionaryCardsTable.lifecycle} = 'active')`,
                    maximumSortKey: sql<
                        string | null
                    >`(max(${dictionaryCardsTable.sortKey}) filter (where ${dictionaryCardsTable.lifecycle} = 'active'))::text`,
                })
                .from(dictionaryCardsTable)
                .where(eq(dictionaryCardsTable.dictionaryId, job.dictionaryId));
            assertDictionaryCardCapacity(Number(cardState?.active ?? 0) + 1);
            const [ownerCardCount] = await tx
                .select({ value: count() })
                .from(dictionaryCardsTable)
                .innerJoin(
                    dictionariesTable,
                    eq(dictionaryCardsTable.dictionaryId, dictionariesTable.id),
                )
                .where(eq(dictionariesTable.ownerId, input.ownerId));
            const [ownerDictionaryCount] = await tx
                .select({ value: count() })
                .from(dictionariesTable)
                .where(eq(dictionariesTable.ownerId, input.ownerId));
            const [ownerRevisionCount] = await tx
                .select({ value: count() })
                .from(dictionaryCardRevisionsTable)
                .innerJoin(
                    dictionariesTable,
                    eq(
                        dictionaryCardRevisionsTable.dictionaryId,
                        dictionariesTable.id,
                    ),
                )
                .where(eq(dictionariesTable.ownerId, input.ownerId));
            assertDictionaryOwnerCapacity(
                {
                    cards: Number(ownerCardCount?.value ?? 0),
                    dictionaries: Number(ownerDictionaryCount?.value ?? 0),
                    revisions: Number(ownerRevisionCount?.value ?? 0),
                },
                { cards: 1, dictionaries: 0, revisions: 1 },
                dictionaryLimits,
            );
            const [duplicateSourceMatch] = await tx
                .select({ id: dictionaryCardsTable.id })
                .from(dictionaryCardsTable)
                .where(
                    and(
                        eq(dictionaryCardsTable.dictionaryId, job.dictionaryId),
                        eq(
                            dictionaryCardsTable.normalizedSource,
                            normalizeDictionaryCardSourceForSearch(
                                candidateValues.source,
                            ),
                        ),
                    ),
                )
                .limit(1);
            const duplicateSource = Boolean(duplicateSourceMatch);
            abort(input.context);

            const cardId = this.ids.generate();
            const [card] = await tx
                .insert(dictionaryCardsTable)
                .values({
                    authorship: aiAssisted ? 'mixed' : 'human',
                    createdAt: input.context.now,
                    customNotationLabelOverride:
                        candidateOverrides.customNotationLabel,
                    definition: candidateValues.definition,
                    definitionEnabledOverride:
                        candidateOverrides.definitionEnabled,
                    definitionLanguageRoleOverride:
                        candidateOverrides.definitionLanguageRole,
                    dictionaryId: job.dictionaryId,
                    example: candidateValues.example,
                    exampleEnabledOverride: candidateOverrides.exampleEnabled,
                    exampleLanguageRoleOverride:
                        candidateOverrides.exampleLanguageRole,
                    exampleTranslation: candidateValues.exampleTranslation,
                    exampleTranslationEnabledOverride:
                        candidateOverrides.exampleTranslationEnabled,
                    id: cardId,
                    lifecycle: 'active',
                    normalizedSource: normalizeDictionaryCardSourceForSearch(
                        candidateValues.source,
                    ),
                    sortKey:
                        BigInt(cardState?.maximumSortKey ?? 0) +
                        dictionaryCardSortGap,
                    source: candidateValues.source,
                    transcription: candidateValues.transcription,
                    transcriptionEnabledOverride:
                        candidateOverrides.transcriptionEnabled,
                    transcriptionNotationOverride:
                        candidateOverrides.transcriptionNotation,
                    translation: candidateValues.translation,
                    updatedAt: input.context.now,
                })
                .returning();
            if (!card) throw new DictionaryVersionConflictError();
            const revisionId = this.ids.generate();
            await tx.insert(dictionaryCardRevisionsTable).values({
                acceptedGenerationJobId: job.id,
                actorUserId: input.ownerId,
                authorship: aiAssisted ? 'mixed' : 'human',
                cardId: card.id,
                cardVersion: card.version,
                createdAt: input.context.now,
                dictionaryId: card.dictionaryId,
                id: revisionId,
                mutationKind: aiAssisted
                    ? 'ai_proposal_accept'
                    : 'manual_create',
                revisionNumber: card.version,
                schemaVersion: 1,
                settingsVersion: current.settings.version,
                snapshot: revisionSnapshot(card, current.settings),
            });
            const [updatedDictionary] = await tx
                .update(dictionariesTable)
                .set({
                    updatedAt: input.context.now,
                    version: current.dictionary.version + 1,
                })
                .where(
                    and(
                        eq(dictionariesTable.id, current.dictionary.id),
                        eq(
                            dictionariesTable.version,
                            current.dictionary.version,
                        ),
                    ),
                )
                .returning({ version: dictionariesTable.version });
            if (!updatedDictionary) throw new DictionaryVersionConflictError();

            await tx
                .update(dictionaryGenerationProposalsTable)
                .set({
                    acceptedCandidateFingerprint: input.acceptanceFingerprint,
                    acceptedCardId: card.id,
                    acceptedCardVersion: card.version,
                    acceptedDictionaryVersion: updatedDictionary.version,
                    acceptedDuplicateSource: duplicateSource,
                    acceptedRevisionId: revisionId,
                    payload: null,
                    reviewState: 'accepted',
                    terminalAt: input.context.now,
                    updatedAt: input.context.now,
                })
                .where(eq(dictionaryGenerationProposalsTable.jobId, job.id));
            await tx
                .update(dictionaryGenerationJobsTable)
                .set({ inputPayload: null, updatedAt: input.context.now })
                .where(eq(dictionaryGenerationJobsTable.id, job.id));
            const acceptedJob = await this.readView(tx, job, input.context.now);
            if (acceptedJob.kind !== 'card-authoring' || !acceptedJob.outcome)
                throw new DictionaryGenerationCandidateConflictError();
            return {
                expired: false as const,
                value: { job: acceptedJob, outcome: acceptedJob.outcome },
            };
        });
        if (result.expired)
            throw new DictionaryGenerationProposalExpiredError();
        return result.value;
    }

    /** @deprecated Use acceptSingleCard through the application port. */
    public async accept(
        input: Parameters<DictionaryGenerationStore['acceptSingleCard']>[0],
    ) {
        return this.acceptSingleCard(input);
    }

    public async acceptBatch(
        input: Parameters<DictionaryGenerationStore['acceptBatch']>[0],
    ) {
        const selected = [...input.selected].sort(
            (left, right) => left.rowIndex - right.rowIndex,
        );
        const result = await this.database.transaction(async (tx) => {
            abort(input.context);
            await tx.execute(
                sql`select pg_advisory_xact_lock(${dictionaryGenerationAdmissionLock})`,
            );
            await tx
                .select({ id: usersTable.id })
                .from(usersTable)
                .where(eq(usersTable.id, input.ownerId))
                .for('update');
            abort(input.context);
            const job = await this.lockOwnedJob(tx, input.ownerId, input.jobId);
            if (
                job.kind !== 'pasted-terms' &&
                job.kind !== 'document-terms' &&
                job.kind !== 'import-pairs'
            )
                throw new DictionaryGenerationNotReviewableError();
            const proposal = await this.lockProposal(tx, job.id);
            if (!proposal) throw new DictionaryGenerationNotReviewableError();
            if (proposal.reviewState === 'accepted') {
                if (
                    proposal.acceptedCandidateFingerprint !==
                    input.acceptanceFingerprint
                )
                    throw new DictionaryGenerationCandidateConflictError();
                const acceptedJob = await this.readView(
                    tx,
                    job,
                    input.context.now,
                );
                if (
                    ![
                        'pasted-terms',
                        'document-terms',
                        'import-pairs',
                    ].includes(acceptedJob.kind) ||
                    !acceptedJob.outcome ||
                    !('cards' in acceptedJob.outcome)
                )
                    throw new DictionaryGenerationCandidateConflictError();
                return {
                    expired: false as const,
                    value: { job: acceptedJob, outcome: acceptedJob.outcome },
                };
            }
            if (proposal.reviewState === 'expired')
                return { expired: true as const };
            if (proposal.reviewState !== 'reviewable' || !proposal.payload)
                throw new DictionaryGenerationNotReviewableError();
            if (proposal.documentStagedAt && !proposal.documentPublishedAt)
                throw new DictionaryGenerationNotReviewableError();
            if (proposal.expiresAt <= input.context.now) {
                await this.expireProposal(tx, job.id, input.context.now);
                return { expired: true as const };
            }

            const storedProposal =
                job.kind === 'import-pairs'
                    ? parseDictionaryImportPairsGenerationProposal(
                          proposal.payload,
                      )
                    : parseDictionaryBatchGenerationProposal(proposal.payload);
            const storedCandidates = new Map(
                storedProposal.candidates.map((candidate) => [
                    candidate.rowIndex,
                    candidate,
                ]),
            );
            const acceptedCandidates = selected.map((selection) => {
                const stored = storedCandidates.get(selection.rowIndex);
                if (!stored)
                    throw new DictionaryGenerationCandidateConflictError();
                const candidate = parseDictionaryGenerationProposal({
                    candidate: selection.candidate,
                    fieldFeedback: stored.fieldFeedback,
                    warnings: [],
                }).candidate;
                const candidateOverrides = domainOverrides(candidate.overrides);
                const candidateValues = normalizeCardValues(candidate.values);
                const proposalEdited = !areCardSemanticStatesEqual(
                    {
                        overrides: domainOverrides(stored.candidate.overrides),
                        values: stored.candidate.values,
                    },
                    {
                        overrides: candidateOverrides,
                        values: candidateValues,
                    },
                );
                return {
                    authorship:
                        job.kind === 'import-pairs' || proposalEdited
                            ? ('mixed' as const)
                            : ('ai-generated' as const),
                    overrides: candidateOverrides,
                    rowIndex: selection.rowIndex,
                    values: candidateValues,
                };
            });

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
                        eq(dictionariesTable.id, job.dictionaryId),
                        eq(dictionariesTable.ownerId, input.ownerId),
                    ),
                )
                .for('update');
            if (!current) throw new DictionaryGenerationJobNotFoundError();
            if (
                current.dictionary.lifecycle !== 'active' ||
                current.dictionary.version !== job.expectedDictionaryVersion ||
                current.settings.version !== job.expectedSettingsVersion ||
                current.dictionary.sourceLanguageTag !==
                    job.sourceLanguageTag ||
                current.dictionary.targetLanguageTag !== job.targetLanguageTag
            )
                throw new DictionaryVersionConflictError();
            for (const candidate of acceptedCandidates) {
                assertCardSettingsOverrideTransition({
                    dictionary: domainSettings(current.settings),
                    next: candidate.overrides,
                    previous: null,
                });
            }

            const [dictionaryCardState] = await tx
                .select({
                    active: sql<number>`count(*) filter (where ${dictionaryCardsTable.lifecycle} = 'active')`,
                    maximumSortKey: sql<
                        string | null
                    >`(max(${dictionaryCardsTable.sortKey}) filter (where ${dictionaryCardsTable.lifecycle} = 'active'))::text`,
                })
                .from(dictionaryCardsTable)
                .where(eq(dictionaryCardsTable.dictionaryId, job.dictionaryId));
            const existingSources = await tx
                .select({
                    cardId: dictionaryCardsTable.id,
                    source: dictionaryCardsTable.source,
                })
                .from(dictionaryCardsTable)
                .where(eq(dictionaryCardsTable.dictionaryId, job.dictionaryId))
                .orderBy(
                    asc(dictionaryCardsTable.createdAt),
                    asc(dictionaryCardsTable.id),
                );
            const acceptanceWarnings = createDictionaryBatchDuplicateWarnings(
                acceptedCandidates.map((candidate) => ({
                    input: candidate.values.source,
                    rowIndex: candidate.rowIndex,
                })),
                existingSources,
            );
            assertDictionaryCardCapacity(
                Number(dictionaryCardState?.active ?? 0) +
                    acceptedCandidates.length,
            );
            const [ownerCardCount] = await tx
                .select({ value: count() })
                .from(dictionaryCardsTable)
                .innerJoin(
                    dictionariesTable,
                    eq(dictionaryCardsTable.dictionaryId, dictionariesTable.id),
                )
                .where(eq(dictionariesTable.ownerId, input.ownerId));
            const [ownerDictionaryCount] = await tx
                .select({ value: count() })
                .from(dictionariesTable)
                .where(eq(dictionariesTable.ownerId, input.ownerId));
            const [ownerRevisionCount] = await tx
                .select({ value: count() })
                .from(dictionaryCardRevisionsTable)
                .innerJoin(
                    dictionariesTable,
                    eq(
                        dictionaryCardRevisionsTable.dictionaryId,
                        dictionariesTable.id,
                    ),
                )
                .where(eq(dictionariesTable.ownerId, input.ownerId));
            assertDictionaryOwnerCapacity(
                {
                    cards: Number(ownerCardCount?.value ?? 0),
                    dictionaries: Number(ownerDictionaryCount?.value ?? 0),
                    revisions: Number(ownerRevisionCount?.value ?? 0),
                },
                {
                    cards: acceptedCandidates.length,
                    dictionaries: 0,
                    revisions: acceptedCandidates.length,
                },
                dictionaryLimits,
            );
            abort(input.context);

            const maximumSortKey = BigInt(
                dictionaryCardState?.maximumSortKey ?? 0,
            );
            const cardInserts = acceptedCandidates.map((candidate, index) => ({
                authorship: candidate.authorship,
                createdAt: input.context.now,
                customNotationLabelOverride:
                    candidate.overrides.customNotationLabel,
                definition: candidate.values.definition,
                definitionEnabledOverride:
                    candidate.overrides.definitionEnabled,
                definitionLanguageRoleOverride:
                    candidate.overrides.definitionLanguageRole,
                dictionaryId: job.dictionaryId,
                example: candidate.values.example,
                exampleEnabledOverride: candidate.overrides.exampleEnabled,
                exampleLanguageRoleOverride:
                    candidate.overrides.exampleLanguageRole,
                exampleTranslation: candidate.values.exampleTranslation,
                exampleTranslationEnabledOverride:
                    candidate.overrides.exampleTranslationEnabled,
                id: this.ids.generate(),
                lifecycle: 'active' as const,
                normalizedSource: normalizeDictionaryCardSourceForSearch(
                    candidate.values.source,
                ),
                sortKey:
                    maximumSortKey + BigInt(index + 1) * dictionaryCardSortGap,
                source: candidate.values.source,
                transcription: candidate.values.transcription,
                transcriptionEnabledOverride:
                    candidate.overrides.transcriptionEnabled,
                transcriptionNotationOverride:
                    candidate.overrides.transcriptionNotation,
                translation: candidate.values.translation,
                updatedAt: input.context.now,
            }));
            const insertedCards = await tx
                .insert(dictionaryCardsTable)
                .values(cardInserts)
                .returning();
            if (insertedCards.length !== acceptedCandidates.length)
                throw new DictionaryVersionConflictError();
            const cardsById = new Map(
                insertedCards.map((card) => [card.id, card]),
            );
            const orderedCards = cardInserts.map((insert) => {
                const card = cardsById.get(insert.id);
                if (!card) throw new DictionaryVersionConflictError();
                return card;
            });
            await tx.insert(dictionaryCardRevisionsTable).values(
                orderedCards.map((card) => ({
                    acceptedGenerationJobId: job.id,
                    actorUserId: input.ownerId,
                    authorship: card.authorship,
                    cardId: card.id,
                    cardVersion: card.version,
                    createdAt: input.context.now,
                    dictionaryId: card.dictionaryId,
                    id: this.ids.generate(),
                    mutationKind: 'ai_proposal_accept' as const,
                    revisionNumber: card.version,
                    schemaVersion: 1,
                    settingsVersion: current.settings.version,
                    snapshot: revisionSnapshot(card, current.settings),
                })),
            );
            const [updatedDictionary] = await tx
                .update(dictionariesTable)
                .set({
                    updatedAt: input.context.now,
                    version: current.dictionary.version + 1,
                })
                .where(
                    and(
                        eq(dictionariesTable.id, current.dictionary.id),
                        eq(
                            dictionariesTable.version,
                            current.dictionary.version,
                        ),
                    ),
                )
                .returning({ version: dictionariesTable.version });
            if (!updatedDictionary) throw new DictionaryVersionConflictError();
            const outcome =
                job.kind === 'import-pairs'
                    ? DictionaryImportPairsGenerationAcceptedOutcomeSchema.parse(
                          {
                              authorship: 'mixed',
                              cards: orderedCards.map((card, index) => ({
                                  cardId: card.id,
                                  cardVersion: card.version,
                                  rowIndex: acceptedCandidates[index]!.rowIndex,
                              })),
                              dictionaryVersion: updatedDictionary.version,
                              warnings: acceptanceWarnings,
                          },
                      )
                    : DictionaryPastedTermsGenerationAcceptedOutcomeSchema.parse(
                          {
                              cards: orderedCards.map((card, index) => ({
                                  cardId: card.id,
                                  cardVersion: card.version,
                                  rowIndex: acceptedCandidates[index]!.rowIndex,
                              })),
                              dictionaryVersion: updatedDictionary.version,
                              warnings: acceptanceWarnings,
                          },
                      );

            await tx
                .update(dictionaryGenerationProposalsTable)
                .set({
                    acceptedBatchOutcome: outcome,
                    acceptedCandidateFingerprint: input.acceptanceFingerprint,
                    payload: null,
                    reviewState: 'accepted',
                    terminalAt: input.context.now,
                    updatedAt: input.context.now,
                })
                .where(eq(dictionaryGenerationProposalsTable.jobId, job.id));
            await tx
                .update(dictionaryGenerationJobsTable)
                .set({ inputPayload: null, updatedAt: input.context.now })
                .where(eq(dictionaryGenerationJobsTable.id, job.id));
            const acceptedJob = await this.readView(tx, job, input.context.now);
            if (
                !['pasted-terms', 'document-terms', 'import-pairs'].includes(
                    acceptedJob.kind,
                ) ||
                !acceptedJob.outcome ||
                !('cards' in acceptedJob.outcome)
            )
                throw new DictionaryGenerationCandidateConflictError();
            return {
                expired: false as const,
                value: { job: acceptedJob, outcome: acceptedJob.outcome },
            };
        });
        if (result.expired)
            throw new DictionaryGenerationProposalExpiredError();
        return result.value;
    }

    public async acceptPastedTerms(
        input: Parameters<DictionaryGenerationStore['acceptPastedTerms']>[0],
    ) {
        return this.acceptBatch(input);
    }

    public async claim(
        input: Parameters<DictionaryGenerationStore['claim']>[0],
    ): Promise<ClaimedDictionaryGenerationJob | null> {
        return this.database.transaction(async (tx) => {
            abort(input.context);
            await tx.execute(
                sql`select pg_advisory_xact_lock(${dictionaryGenerationAdmissionLock})`,
            );
            const stale = await tx
                .select()
                .from(dictionaryGenerationJobsTable)
                .where(
                    and(
                        eq(
                            dictionaryGenerationJobsTable.executionState,
                            'running',
                        ),
                        lte(
                            dictionaryGenerationJobsTable.leaseDeadline,
                            input.context.now,
                        ),
                    ),
                )
                .orderBy(asc(dictionaryGenerationJobsTable.leaseDeadline))
                .limit(25)
                .for('update', { skipLocked: true });
            for (const job of stale) {
                const cancelled = job.cancellationRequestedAt !== null;
                const exhausted = job.attemptCount >= job.maxAttempts;
                await tx
                    .update(dictionaryGenerationJobsTable)
                    .set({
                        completedAt:
                            cancelled || exhausted ? input.context.now : null,
                        executionState: cancelled
                            ? 'cancelled'
                            : exhausted
                              ? 'failed'
                              : 'queued',
                        failureCategory: exhausted ? 'retry_exhausted' : null,
                        fencingToken: job.fencingToken + 1n,
                        heartbeatAt: null,
                        inputPayload:
                            cancelled || exhausted ? null : job.inputPayload,
                        leaseDeadline: null,
                        nextAttemptAt: input.context.now,
                        progressPercent: cancelled || exhausted ? 100 : 0,
                        progressStage:
                            cancelled || exhausted ? 'terminal' : 'queued',
                        providerActualCostMicros: cancelled
                            ? job.providerReservedCostMicros
                            : exhausted
                              ? job.providerReservedCostMicros
                              : null,
                        providerActualInputTokens: cancelled
                            ? job.providerReservedInputTokens
                            : exhausted
                              ? job.providerReservedInputTokens
                              : null,
                        providerActualOutputTokens: cancelled
                            ? job.providerReservedOutputTokens
                            : exhausted
                              ? job.providerReservedOutputTokens
                              : null,
                        providerReservationSettledAt:
                            cancelled || exhausted ? input.context.now : null,
                        providerReservationState: cancelled
                            ? 'settled'
                            : exhausted
                              ? 'settled'
                              : 'active',
                        updatedAt: input.context.now,
                        workerId: null,
                    })
                    .where(
                        and(
                            eq(dictionaryGenerationJobsTable.id, job.id),
                            eq(
                                dictionaryGenerationJobsTable.fencingToken,
                                job.fencingToken,
                            ),
                            eq(
                                dictionaryGenerationJobsTable.leaseDeadline,
                                job.leaseDeadline!,
                            ),
                        ),
                    );
                if (job.kind === 'document-terms' && (cancelled || exhausted))
                    await this.scheduleDocumentCleanup(
                        tx,
                        job.id,
                        input.context.now,
                        cancelled ? 'cancelled' : 'failed',
                    );
            }

            const cancelledQueued = await tx
                .select()
                .from(dictionaryGenerationJobsTable)
                .where(
                    and(
                        eq(
                            dictionaryGenerationJobsTable.executionState,
                            'queued',
                        ),
                        isNull(dictionaryGenerationJobsTable.awaitingUploadAt),
                        isNotNull(
                            dictionaryGenerationJobsTable.cancellationRequestedAt,
                        ),
                    ),
                )
                .limit(25)
                .for('update', { skipLocked: true });
            for (const job of cancelledQueued) {
                const incurredProviderCost = job.attemptCount > 0;
                await tx
                    .update(dictionaryGenerationJobsTable)
                    .set({
                        completedAt: input.context.now,
                        executionState: 'cancelled',
                        inputPayload: null,
                        progressPercent: 100,
                        progressStage: 'terminal',
                        providerActualCostMicros: incurredProviderCost
                            ? job.providerReservedCostMicros
                            : 0,
                        providerActualInputTokens: incurredProviderCost
                            ? job.providerReservedInputTokens
                            : 0,
                        providerActualOutputTokens: incurredProviderCost
                            ? job.providerReservedOutputTokens
                            : 0,
                        providerReservationSettledAt: input.context.now,
                        providerReservationState: incurredProviderCost
                            ? 'settled'
                            : 'released',
                        updatedAt: input.context.now,
                    })
                    .where(
                        and(
                            eq(dictionaryGenerationJobsTable.id, job.id),
                            eq(
                                dictionaryGenerationJobsTable.executionState,
                                'queued',
                            ),
                        ),
                    );
                if (
                    job.kind === 'document-terms' &&
                    job.cancellationRequestedAt
                )
                    await this.scheduleDocumentCleanup(
                        tx,
                        job.id,
                        input.context.now,
                        'cancelled',
                    );
            }

            const [runningCount] = await tx
                .select({ value: count() })
                .from(dictionaryGenerationJobsTable)
                .where(
                    eq(dictionaryGenerationJobsTable.executionState, 'running'),
                );
            if (Number(runningCount?.value ?? 0) >= input.globalConcurrency)
                return null;

            const runningForOwner = sql<number>`(
                select count(*) from ${dictionaryGenerationJobsTable} running
                where running.owner_id = ${dictionaryGenerationJobsTable.ownerId}
                  and running.execution_state = 'running'
            )`;
            const [candidate] = await tx
                .select()
                .from(dictionaryGenerationJobsTable)
                .where(
                    and(
                        eq(
                            dictionaryGenerationJobsTable.executionState,
                            'queued',
                        ),
                        lte(
                            dictionaryGenerationJobsTable.nextAttemptAt,
                            input.context.now,
                        ),
                        inArray(dictionaryGenerationJobsTable.format, [
                            ...input.supportedFormats,
                        ]),
                        sql`not exists (
                            select 1
                            from ${dictionaryGenerationProviderCircuitTable} circuit
                            where circuit.id = ${dictionaryGenerationJobsTable.format}
                              and circuit.open_until > ${input.context.now.toISOString()}::timestamptz
                        )`,
                        lt(
                            dictionaryGenerationJobsTable.attemptCount,
                            dictionaryGenerationJobsTable.maxAttempts,
                        ),
                        sql`${dictionaryGenerationJobsTable.inputPayload} is not null`,
                        sql`not exists (
                            select 1 from ${dictionaryGenerationProposalsTable} staged
                            where staged.job_id = ${dictionaryGenerationJobsTable.id}
                              and staged.document_staged_at is not null
                              and staged.document_published_at is null
                        )`,
                        eq(
                            dictionaryGenerationJobsTable.providerReservationState,
                            'active',
                        ),
                        isNull(
                            dictionaryGenerationJobsTable.cancellationRequestedAt,
                        ),
                        sql`${dictionaryGenerationJobsTable.providerInputCostMicrosPerMillionTokens} >= ${this.providerBudget.inputCostMicrosPerMillionTokens}`,
                        sql`${dictionaryGenerationJobsTable.providerOutputCostMicrosPerMillionTokens} >= ${this.providerBudget.outputCostMicrosPerMillionTokens}`,
                        sql`${dictionaryGenerationJobsTable.providerMaxCostMicrosPerAttempt} >= ${this.providerBudget.maxCostMicrosPerAttempt}`,
                        sql`${dictionaryGenerationJobsTable.providerMaxInputTokensPerAttempt} <= ${this.providerBudget.maxInputTokensPerAttempt}`,
                        sql`${dictionaryGenerationJobsTable.providerMaxOutputTokensPerAttempt} <= ${this.providerBudget.maxOutputTokensPerAttempt}`,
                        sql`${runningForOwner} < ${input.ownerConcurrency}`,
                    ),
                )
                .orderBy(
                    asc(runningForOwner),
                    asc(dictionaryGenerationJobsTable.createdAt),
                    asc(dictionaryGenerationJobsTable.id),
                )
                .limit(1)
                .for('update', { skipLocked: true });
            if (!candidate?.inputPayload) return null;
            const [candidateCircuit] = await tx
                .select()
                .from(dictionaryGenerationProviderCircuitTable)
                .where(
                    eq(
                        dictionaryGenerationProviderCircuitTable.id,
                        candidate.format,
                    ),
                )
                .limit(1)
                .for('update');
            if (
                candidateCircuit?.openUntil &&
                candidateCircuit.openUntil > input.context.now
            )
                return null;
            const candidateProviderBudget = persistedProviderBudget(candidate);
            const reservedAttempts =
                candidate.providerReservedAttempts ||
                Math.max(
                    1,
                    Math.round(
                        candidate.providerReservedCostMicros /
                            candidateProviderBudget.maxCostMicrosPerAttempt,
                    ),
                );
            const needsAttemptReservation =
                reservedAttempts < candidate.attemptCount + 1;
            const budgetUsage = await this.providerBudgetUsage(
                tx,
                candidate.ownerId,
                input.context.now,
            );
            if (
                !dictionaryGenerationProviderBudgetAllows(
                    budgetUsage,
                    needsAttemptReservation,
                    candidateProviderBudget,
                )
            )
                return null;
            const parsed = parseDictionaryGenerationInput(
                candidate.inputPayload,
            );
            const leaseDeadline = new Date(
                input.context.now.getTime() + input.leaseDurationMs,
            );
            const fencingToken = candidate.fencingToken + 1n;
            const [claimed] = await tx
                .update(dictionaryGenerationJobsTable)
                .set({
                    attemptCount: candidate.attemptCount + 1,
                    executionState: 'running',
                    fencingToken,
                    heartbeatAt: input.context.now,
                    leaseDeadline,
                    progressPercent: 5,
                    progressStage: 'generating',
                    providerReservedAttempts:
                        reservedAttempts + (needsAttemptReservation ? 1 : 0),
                    providerReservedCostMicros:
                        candidate.providerReservedCostMicros +
                        (needsAttemptReservation
                            ? candidateProviderBudget.maxCostMicrosPerAttempt
                            : 0),
                    providerReservedInputTokens:
                        candidate.providerReservedInputTokens +
                        (needsAttemptReservation
                            ? candidateProviderBudget.maxInputTokensPerAttempt
                            : 0),
                    providerReservedOutputTokens:
                        candidate.providerReservedOutputTokens +
                        (needsAttemptReservation
                            ? candidateProviderBudget.maxOutputTokensPerAttempt
                            : 0),
                    updatedAt: input.context.now,
                    workerId: input.workerId,
                })
                .where(
                    and(
                        eq(dictionaryGenerationJobsTable.id, candidate.id),
                        eq(
                            dictionaryGenerationJobsTable.executionState,
                            'queued',
                        ),
                        eq(
                            dictionaryGenerationJobsTable.fencingToken,
                            candidate.fencingToken,
                        ),
                        isNull(
                            dictionaryGenerationJobsTable.cancellationRequestedAt,
                        ),
                    ),
                )
                .returning();
            if (!claimed) return null;
            return {
                attempt: claimed.attemptCount,
                fencingToken,
                id: claimed.id,
                input: parsed,
                leaseDeadline,
                providerBudget: candidateProviderBudget,
                workerId: input.workerId,
            };
        });
    }

    public async heartbeat(
        input: Parameters<DictionaryGenerationStore['heartbeat']>[0],
    ) {
        abort(input.context);
        const [updated] = await this.database
            .update(dictionaryGenerationJobsTable)
            .set({
                heartbeatAt: input.context.now,
                leaseDeadline: input.nextLeaseDeadline,
                progressPercent: input.progress?.percent,
                progressStage: input.progress?.stage,
                updatedAt: input.context.now,
            })
            .where(
                and(
                    this.workerCas(input),
                    isNull(
                        dictionaryGenerationJobsTable.cancellationRequestedAt,
                    ),
                ),
            )
            .returning({ id: dictionaryGenerationJobsTable.id });
        return Boolean(updated);
    }

    public async complete(
        input: Parameters<DictionaryGenerationStore['complete']>[0],
    ) {
        return this.database.transaction(async (tx) => {
            abort(input.context);
            const [job] = await tx
                .select()
                .from(dictionaryGenerationJobsTable)
                .where(this.workerCas(input))
                .for('update');
            if (!job) return false;
            const jobProviderBudget = persistedProviderBudget(job);
            if (job.cancellationRequestedAt) {
                await this.terminalizeCancelled(tx, job, input.context.now);
                return true;
            }
            const jobInput = parseDictionaryGenerationInput(job.inputPayload);
            if (jobInput.format === dictionaryDocumentGenerationFormat)
                throw new Error(
                    'Document completion requires staged cleanup publication',
                );
            let authoringPredecessor:
                DictionaryCardAuthoringProposalPayload | undefined;
            if (
                jobInput.format === dictionaryCardAuthoringGenerationFormat &&
                jobInput.predecessor
            ) {
                const predecessorJob = await this.lockOwnedJob(
                    tx,
                    job.ownerId,
                    jobInput.predecessor.jobId,
                );
                if (
                    predecessorJob.kind !== 'card-authoring' ||
                    predecessorJob.dictionaryId !== job.dictionaryId ||
                    predecessorJob.expectedDictionaryVersion !==
                        job.expectedDictionaryVersion ||
                    predecessorJob.expectedSettingsVersion !==
                        job.expectedSettingsVersion ||
                    predecessorJob.sourceLanguageTag !==
                        job.sourceLanguageTag ||
                    predecessorJob.targetLanguageTag !== job.targetLanguageTag
                )
                    throw new DictionaryGenerationCompletionConflictError(
                        'predecessor_changed',
                    );
                const predecessorProposal = await this.lockProposal(
                    tx,
                    predecessorJob.id,
                );
                if (
                    !predecessorProposal ||
                    predecessorProposal.reviewState !== 'reviewable' ||
                    !predecessorProposal.payload ||
                    predecessorProposal.expiresAt <= input.context.now
                )
                    throw new DictionaryGenerationCompletionConflictError(
                        'predecessor_changed',
                    );
                authoringPredecessor =
                    DictionaryCardAuthoringProposalPayloadSchema.parse(
                        predecessorProposal.payload,
                    );
                const discarded = new Set(
                    jobInput.predecessor.discardedSuggestionIds,
                );
                for (const field of resolveDictionaryCardAuthoringFields(
                    jobInput.effectiveSettings,
                    jobInput.scope,
                )) {
                    const remaining = authoringPredecessor.suggestions.filter(
                        (suggestion) =>
                            suggestion.field === field &&
                            !discarded.has(suggestion.id),
                    ).length;
                    if (
                        remaining >=
                        dictionaryCardAuthoringSuggestionLimitPerField
                    )
                        throw new DictionaryGenerationCompletionConflictError(
                            'suggestion_capacity_reached',
                        );
                }
            }
            const mergeAuthoringProposal = () => {
                try {
                    return mergeDictionaryCardAuthoringProposal({
                        delta: DictionaryCardAuthoringProviderDeltaSchema.parse(
                            input.proposal,
                        ),
                        discardedSuggestionIds:
                            jobInput.format ===
                            dictionaryCardAuthoringGenerationFormat
                                ? (jobInput.predecessor
                                      ?.discardedSuggestionIds ?? [])
                                : [],
                        nextId: () => this.ids.generate(),
                        ...(authoringPredecessor
                            ? { predecessor: authoringPredecessor }
                            : {}),
                        requestedFields:
                            jobInput.format ===
                            dictionaryCardAuthoringGenerationFormat
                                ? resolveDictionaryCardAuthoringFields(
                                      jobInput.effectiveSettings,
                                      jobInput.scope,
                                  )
                                : [],
                        source:
                            jobInput.format ===
                            dictionaryCardAuthoringGenerationFormat
                                ? jobInput.source
                                : '',
                    });
                } catch (error) {
                    if (
                        error instanceof
                        DictionaryCardAuthoringSuggestionLimitError
                    )
                        throw new DictionaryGenerationCompletionConflictError(
                            'suggestion_capacity_reached',
                        );
                    throw error;
                }
            };
            let proposal =
                jobInput.format === dictionaryCardAuthoringGenerationFormat
                    ? mergeAuthoringProposal()
                    : jobInput.format === dictionaryPastedTermsGenerationFormat
                      ? parseDictionaryBatchGenerationProposal(input.proposal)
                      : jobInput.format ===
                          dictionaryImportPairsGenerationFormat
                        ? parseDictionaryImportPairsGenerationProposal(
                              input.proposal,
                          )
                        : parseDictionaryGenerationProposal(input.proposal);
            if (jobInput.format === dictionaryPastedTermsGenerationFormat) {
                const batchProposal =
                    parseDictionaryBatchGenerationProposal(proposal);
                const persistedRows = new Map(
                    jobInput.rows.map((row) => [row.rowIndex, row.input]),
                );
                const resolvedRows = [
                    ...batchProposal.candidates,
                    ...batchProposal.failures,
                ];
                if (
                    resolvedRows.length !== jobInput.rows.length ||
                    resolvedRows.some(
                        (row) => persistedRows.get(row.rowIndex) !== row.input,
                    )
                )
                    throw new Error(
                        'Batch proposal rows do not match persisted input',
                    );
                const existingSources = await tx
                    .select({
                        cardId: dictionaryCardsTable.id,
                        source: dictionaryCardsTable.source,
                    })
                    .from(dictionaryCardsTable)
                    .where(
                        eq(dictionaryCardsTable.dictionaryId, job.dictionaryId),
                    )
                    .orderBy(
                        asc(dictionaryCardsTable.sortKey),
                        asc(dictionaryCardsTable.id),
                    );
                proposal = parseDictionaryBatchGenerationProposal({
                    ...batchProposal,
                    warnings: createDictionaryBatchDuplicateWarnings(
                        batchProposal.candidates.map((candidate) => ({
                            input: candidate.candidate.values.source,
                            rowIndex: candidate.rowIndex,
                        })),
                        existingSources,
                    ),
                });
            }
            if (jobInput.format === dictionaryImportPairsGenerationFormat) {
                const importProposal =
                    parseDictionaryImportPairsGenerationProposal(proposal);
                const persistedRows = new Map(
                    jobInput.rows.map((row) => [row.rowIndex, row] as const),
                );
                const resolvedIndexes = [
                    ...importProposal.candidates.map((row) => row.rowIndex),
                    ...importProposal.failures.map((row) => row.rowIndex),
                ];
                if (
                    resolvedIndexes.length !== jobInput.rows.length ||
                    resolvedIndexes.some(
                        (rowIndex) => !persistedRows.has(rowIndex),
                    ) ||
                    importProposal.candidates.some((candidate) => {
                        const persisted = persistedRows.get(candidate.rowIndex);
                        return (
                            persisted?.source !== candidate.source ||
                            persisted.translation !== candidate.translation
                        );
                    }) ||
                    importProposal.failures.some((failure) => {
                        const persisted = persistedRows.get(failure.rowIndex);
                        return (
                            persisted?.source !== failure.source ||
                            persisted.translation !== failure.translation ||
                            persisted.source !== failure.input
                        );
                    })
                )
                    throw new Error(
                        'Import-pairs proposal rows do not match persisted input',
                    );
                const existingSources = await tx
                    .select({
                        cardId: dictionaryCardsTable.id,
                        source: dictionaryCardsTable.source,
                    })
                    .from(dictionaryCardsTable)
                    .where(
                        eq(dictionaryCardsTable.dictionaryId, job.dictionaryId),
                    )
                    .orderBy(
                        asc(dictionaryCardsTable.sortKey),
                        asc(dictionaryCardsTable.id),
                    );
                proposal = parseDictionaryImportPairsGenerationProposal({
                    ...importProposal,
                    warnings: createDictionaryBatchDuplicateWarnings(
                        importProposal.candidates.map((candidate) => ({
                            input: candidate.source,
                            rowIndex: candidate.rowIndex,
                        })),
                        existingSources,
                    ),
                });
            }
            if (jobInput.format === dictionaryGenerationFormat) {
                const [settings] = await tx
                    .select()
                    .from(dictionarySettingsTable)
                    .where(
                        eq(
                            dictionarySettingsTable.dictionaryId,
                            job.dictionaryId,
                        ),
                    )
                    .limit(1);
                if (!settings) return false;
                const singleProposal =
                    parseDictionaryGenerationProposal(proposal);
                assertCardSettingsOverrideTransition({
                    dictionary: domainSettings(settings),
                    next: domainOverrides(singleProposal.candidate.overrides),
                    previous: domainOverrides(jobInput.original.overrides),
                });
            }
            if (
                input.providerUsage &&
                (!Number.isSafeInteger(input.providerUsage.inputTokens) ||
                    input.providerUsage.inputTokens < 0 ||
                    !Number.isSafeInteger(input.providerUsage.outputTokens) ||
                    input.providerUsage.outputTokens < 0 ||
                    input.providerUsage.inputTokens >
                        jobProviderBudget.maxInputTokensPerAttempt ||
                    input.providerUsage.outputTokens >
                        jobProviderBudget.maxOutputTokensPerAttempt)
            )
                throw new Error('Invalid provider usage');
            const priorAttemptCount = Math.max(0, job.attemptCount - 1);
            const finalAttemptCostMicros = input.providerUsage
                ? dictionaryGenerationProviderUsageCostMicros(
                      jobProviderBudget,
                      input.providerUsage,
                  )
                : jobProviderBudget.maxCostMicrosPerAttempt;
            const actualCostMicros =
                priorAttemptCount * jobProviderBudget.maxCostMicrosPerAttempt +
                finalAttemptCostMicros;
            const actualInputTokens = input.providerUsage
                ? priorAttemptCount *
                      jobProviderBudget.maxInputTokensPerAttempt +
                  input.providerUsage.inputTokens
                : job.providerReservedInputTokens;
            const actualOutputTokens = input.providerUsage
                ? priorAttemptCount *
                      jobProviderBudget.maxOutputTokensPerAttempt +
                  input.providerUsage.outputTokens
                : job.providerReservedOutputTokens;
            if (
                actualCostMicros > job.providerReservedCostMicros ||
                actualInputTokens > job.providerReservedInputTokens ||
                actualOutputTokens > job.providerReservedOutputTokens
            )
                throw new Error('Provider usage exceeds reservation');
            await tx.insert(dictionaryGenerationProposalsTable).values({
                createdAt: input.context.now,
                expiresAt: input.reviewExpiresAt,
                jobId: job.id,
                payload: proposal,
                reviewState: 'reviewable',
                schemaVersion: job.proposalSchemaVersion,
                updatedAt: input.context.now,
            });
            const [updated] = await tx
                .update(dictionaryGenerationJobsTable)
                .set({
                    completedAt: input.context.now,
                    executionState: 'completed',
                    heartbeatAt: null,
                    inputPayload:
                        jobInput.format === dictionaryGenerationFormat
                            ? { ...jobInput, instruction: null }
                            : jobInput,
                    leaseDeadline: null,
                    progressPercent: 100,
                    progressStage: 'review_ready',
                    providerActualCostMicros: actualCostMicros,
                    providerActualInputTokens: actualInputTokens,
                    providerActualOutputTokens: actualOutputTokens,
                    providerReservationSettledAt: input.context.now,
                    providerReservationState: 'settled',
                    updatedAt: input.context.now,
                    workerId: null,
                })
                .where(this.workerCas(input))
                .returning({ id: dictionaryGenerationJobsTable.id });
            if (!updated)
                throw new Error('Generation completion fencing changed');
            await this.recordProviderSuccess(tx, job.format, input.context.now);
            return true;
        });
    }

    public async fail(input: Parameters<DictionaryGenerationStore['fail']>[0]) {
        return this.database.transaction(async (tx) => {
            abort(input.context);
            const [job] = await tx
                .select()
                .from(dictionaryGenerationJobsTable)
                .where(this.workerCas(input))
                .for('update');
            if (!job) return false;
            if (job.cancellationRequestedAt) {
                await this.terminalizeCancelled(tx, job, input.context.now);
                return true;
            }
            const retry = input.retryAt && job.attemptCount < job.maxAttempts;
            const jobProviderBudget = persistedProviderBudget(job);
            if (
                input.providerUsage &&
                (!Number.isSafeInteger(input.providerUsage.inputTokens) ||
                    input.providerUsage.inputTokens < 0 ||
                    !Number.isSafeInteger(input.providerUsage.outputTokens) ||
                    input.providerUsage.outputTokens < 0 ||
                    input.providerUsage.inputTokens >
                        jobProviderBudget.maxInputTokensPerAttempt ||
                    input.providerUsage.outputTokens >
                        jobProviderBudget.maxOutputTokensPerAttempt)
            )
                throw new Error('Invalid provider usage');
            const priorAttemptCount = Math.max(0, job.attemptCount - 1);
            const settledCostMicros = input.providerUsage
                ? priorAttemptCount *
                      jobProviderBudget.maxCostMicrosPerAttempt +
                  dictionaryGenerationProviderUsageCostMicros(
                      jobProviderBudget,
                      input.providerUsage,
                  )
                : job.providerReservedCostMicros;
            const settledInputTokens = input.providerUsage
                ? priorAttemptCount *
                      jobProviderBudget.maxInputTokensPerAttempt +
                  input.providerUsage.inputTokens
                : job.providerReservedInputTokens;
            const settledOutputTokens = input.providerUsage
                ? priorAttemptCount *
                      jobProviderBudget.maxOutputTokensPerAttempt +
                  input.providerUsage.outputTokens
                : job.providerReservedOutputTokens;
            if (
                settledCostMicros > job.providerReservedCostMicros ||
                settledInputTokens > job.providerReservedInputTokens ||
                settledOutputTokens > job.providerReservedOutputTokens
            )
                throw new Error('Provider usage exceeds reservation');
            const [updated] = await tx
                .update(dictionaryGenerationJobsTable)
                .set({
                    completedAt: retry ? null : input.context.now,
                    executionState: retry ? 'queued' : 'failed',
                    failureCategory: retry ? null : input.failureCategory,
                    heartbeatAt: null,
                    inputPayload: retry ? job.inputPayload : null,
                    leaseDeadline: null,
                    nextAttemptAt: input.retryAt ?? input.context.now,
                    progressPercent: retry ? 0 : job.progressPercent,
                    progressStage: retry ? 'queued' : 'terminal',
                    providerActualCostMicros: retry ? null : settledCostMicros,
                    providerActualInputTokens: retry
                        ? null
                        : settledInputTokens,
                    providerActualOutputTokens: retry
                        ? null
                        : settledOutputTokens,
                    providerReservationSettledAt: retry
                        ? null
                        : input.context.now,
                    providerReservationState: retry ? 'active' : 'settled',
                    updatedAt: input.context.now,
                    workerId: null,
                })
                .where(this.workerCas(input))
                .returning({ id: dictionaryGenerationJobsTable.id });
            if (
                updated &&
                input.countProviderFailure !== false &&
                [
                    'provider_rate_limited',
                    'provider_timeout',
                    'provider_unavailable',
                ].includes(input.failureCategory)
            )
                await this.recordProviderFailure(
                    tx,
                    job.format,
                    input.context.now,
                );
            if (updated && !retry && job.kind === 'document-terms')
                await this.scheduleDocumentCleanup(
                    tx,
                    job.id,
                    input.context.now,
                    'failed',
                );
            return Boolean(updated);
        });
    }

    public async releaseWorkerLeases(
        input: Parameters<DictionaryGenerationStore['releaseWorkerLeases']>[0],
    ) {
        await this.database.transaction(async (tx) => {
            const jobs = await tx
                .select()
                .from(dictionaryGenerationJobsTable)
                .where(
                    and(
                        eq(
                            dictionaryGenerationJobsTable.executionState,
                            'running',
                        ),
                        eq(
                            dictionaryGenerationJobsTable.workerId,
                            input.workerId,
                        ),
                    ),
                )
                .for('update');
            for (const job of jobs) {
                await tx
                    .update(dictionaryGenerationJobsTable)
                    .set({
                        completedAt: job.cancellationRequestedAt
                            ? input.context.now
                            : null,
                        executionState: job.cancellationRequestedAt
                            ? 'cancelled'
                            : 'queued',
                        fencingToken: job.fencingToken + 1n,
                        heartbeatAt: null,
                        inputPayload: job.cancellationRequestedAt
                            ? null
                            : job.inputPayload,
                        leaseDeadline: null,
                        nextAttemptAt: input.context.now,
                        progressPercent: job.cancellationRequestedAt ? 100 : 0,
                        progressStage: job.cancellationRequestedAt
                            ? 'terminal'
                            : 'queued',
                        providerActualCostMicros: job.cancellationRequestedAt
                            ? job.providerReservedCostMicros
                            : null,
                        providerActualInputTokens: job.cancellationRequestedAt
                            ? job.providerReservedInputTokens
                            : null,
                        providerActualOutputTokens: job.cancellationRequestedAt
                            ? job.providerReservedOutputTokens
                            : null,
                        providerReservationSettledAt:
                            job.cancellationRequestedAt
                                ? input.context.now
                                : null,
                        providerReservationState: job.cancellationRequestedAt
                            ? 'settled'
                            : 'active',
                        updatedAt: input.context.now,
                        workerId: null,
                    })
                    .where(
                        and(
                            eq(dictionaryGenerationJobsTable.id, job.id),
                            eq(
                                dictionaryGenerationJobsTable.workerId,
                                job.workerId!,
                            ),
                            eq(
                                dictionaryGenerationJobsTable.fencingToken,
                                job.fencingToken,
                            ),
                            eq(
                                dictionaryGenerationJobsTable.leaseDeadline,
                                job.leaseDeadline!,
                            ),
                            gt(
                                dictionaryGenerationJobsTable.leaseDeadline,
                                input.context.now,
                            ),
                        ),
                    );
                if (
                    job.kind === 'document-terms' &&
                    job.cancellationRequestedAt
                )
                    await this.scheduleDocumentCleanup(
                        tx,
                        job.id,
                        input.context.now,
                        'cancelled',
                    );
            }
        });
    }

    public async expireReviewPayloads(
        input: Parameters<DictionaryGenerationStore['expireReviewPayloads']>[0],
    ) {
        return this.database.transaction(async (tx) => {
            const rows = await tx
                .select({ jobId: dictionaryGenerationProposalsTable.jobId })
                .from(dictionaryGenerationProposalsTable)
                .where(
                    and(
                        eq(
                            dictionaryGenerationProposalsTable.reviewState,
                            'reviewable',
                        ),
                        or(
                            isNull(
                                dictionaryGenerationProposalsTable.documentStagedAt,
                            ),
                            isNotNull(
                                dictionaryGenerationProposalsTable.documentPublishedAt,
                            ),
                        ),
                        lte(
                            dictionaryGenerationProposalsTable.expiresAt,
                            input.context.now,
                        ),
                    ),
                )
                .orderBy(asc(dictionaryGenerationProposalsTable.expiresAt))
                .limit(input.limit)
                .for('update', { skipLocked: true });
            for (const row of rows)
                await this.expireProposal(tx, row.jobId, input.context.now);
            return rows.length;
        });
    }

    public async readiness(signal: AbortSignal) {
        signal.throwIfAborted();
        await this.database.execute(sql`select 1`);
        signal.throwIfAborted();
    }

    public async observeOperationalState(
        input: Parameters<
            DictionaryGenerationStore['observeOperationalState']
        >[0],
    ): Promise<DictionaryOperationalMeasurement> {
        abort(input.context);
        const windowMs =
            input.context.now.getTime() - input.windowStartedAt.getTime();
        if (windowMs < 10_000 || windowMs > 300_000)
            throw new Error(
                'Dictionary operational measurement window is invalid.',
            );
        const observedAt = input.context.now.toISOString();
        const windowStartedAt = input.windowStartedAt.toISOString();
        const [jobs] = await this.database
            .select({
                awaitingUploadDepth: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.awaitingUploadAt} is not null)`,
                providerActiveReservations: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.providerReservationState} = 'active')`,
                providerReservedInputTokens: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerReservedInputTokens}) filter (where ${dictionaryGenerationJobsTable.providerReservationState} = 'active'), 0)::bigint`,
                providerReservedOutputTokens: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerReservedOutputTokens}) filter (where ${dictionaryGenerationJobsTable.providerReservationState} = 'active'), 0)::bigint`,
                providerReservedCostMicros: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerReservedCostMicros}) filter (where ${dictionaryGenerationJobsTable.providerReservationState} = 'active'), 0)::bigint`,
                expiredRunningLeases: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.executionState} = 'running' and ${dictionaryGenerationJobsTable.leaseDeadline} <= ${observedAt}::timestamptz)`,
                oldestRunnableAgeMs: sql<number>`coalesce(greatest(0, extract(epoch from (${observedAt}::timestamptz - min(${dictionaryGenerationJobsTable.createdAt}) filter (where ${dictionaryGenerationJobsTable.executionState} = 'queued' and ${dictionaryGenerationJobsTable.awaitingUploadAt} is null and ${dictionaryGenerationJobsTable.nextAttemptAt} <= ${observedAt}::timestamptz))) * 1000), 0)::bigint`,
                ownersAtCapacity: sql<number>`(select count(*)::bigint from (select owner_id from dictionary_generation_jobs where execution_state in ('queued', 'running') group by owner_id having count(*) >= ${generationLimits.ownerQueued}) capacity_owners)`,
                queuedDepth: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.executionState} = 'queued' and ${dictionaryGenerationJobsTable.awaitingUploadAt} is null)`,
                retryDepth: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.executionState} = 'queued' and ${dictionaryGenerationJobsTable.awaitingUploadAt} is null and ${dictionaryGenerationJobsTable.attemptCount} > 0)`,
                runningDepth: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.executionState} = 'running')`,
            })
            .from(dictionaryGenerationJobsTable)
            .where(
                inArray(dictionaryGenerationJobsTable.executionState, [
                    'queued',
                    'running',
                ]),
            );
        abort(input.context);
        const [terminalJobs] = await this.database
            .select({
                cancelledCount: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.executionState} = 'cancelled')`,
                completedCount: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.executionState} = 'completed')`,
                failedCount: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.executionState} = 'failed')`,
                expiredCount: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.executionState} = 'expired')`,
                averageDurationMs: sql<number>`coalesce(avg(extract(epoch from (${dictionaryGenerationJobsTable.completedAt} - ${dictionaryGenerationJobsTable.createdAt})) * 1000), 0)::bigint`,
                maximumDurationMs: sql<number>`coalesce(max(extract(epoch from (${dictionaryGenerationJobsTable.completedAt} - ${dictionaryGenerationJobsTable.createdAt})) * 1000), 0)::bigint`,
                ocrFailures: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.failureCategory} = 'ocr_failed')`,
                invalidModelOutputFailures: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.failureCategory} = 'invalid_model_output')`,
                providerUnavailableFailures: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.failureCategory} = 'provider_unavailable')`,
                providerTimeoutFailures: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.failureCategory} = 'provider_timeout')`,
                providerRateLimitedFailures: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.failureCategory} = 'provider_rate_limited')`,
                malwareFailures: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.failureCategory} = 'malware_detected')`,
                scanFailures: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.failureCategory} = 'scan_failed')`,
                invalidDocumentFailures: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.failureCategory} = 'invalid_document')`,
                extractionFailures: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.failureCategory} = 'extraction_failed')`,
                noTermsFoundFailures: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.failureCategory} = 'no_terms_found')`,
                tooManyTermsFailures: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.failureCategory} = 'too_many_terms')`,
                retryAttempts: sql<number>`coalesce(sum(greatest(${dictionaryGenerationJobsTable.attemptCount} - 1, 0)), 0)::bigint`,
            })
            .from(dictionaryGenerationJobsTable)
            .where(
                gte(
                    dictionaryGenerationJobsTable.completedAt,
                    input.windowStartedAt,
                ),
            );
        abort(input.context);
        const [providerSettlements] = await this.database
            .select({
                attempts: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerReservedAttempts}), 0)::bigint`,
                inputTokens: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerActualInputTokens}), 0)::bigint`,
                outputTokens: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerActualOutputTokens}), 0)::bigint`,
                costMicros: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerActualCostMicros}), 0)::bigint`,
            })
            .from(dictionaryGenerationJobsTable)
            .where(
                and(
                    inArray(
                        dictionaryGenerationJobsTable.providerReservationState,
                        ['settled', 'released'],
                    ),
                    gte(
                        dictionaryGenerationJobsTable.providerReservationSettledAt,
                        input.windowStartedAt,
                    ),
                ),
            );
        abort(input.context);
        const formatQueues = await this.database
            .select({
                depth: count(),
                format: dictionaryGenerationJobsTable.format,
                oldestAt: sql<
                    string | null
                >`min(${dictionaryGenerationJobsTable.createdAt}) filter (where ${dictionaryGenerationJobsTable.nextAttemptAt} <= ${observedAt}::timestamptz)::text`,
            })
            .from(dictionaryGenerationJobsTable)
            .where(
                and(
                    eq(dictionaryGenerationJobsTable.executionState, 'queued'),
                    isNull(dictionaryGenerationJobsTable.awaitingUploadAt),
                ),
            )
            .groupBy(dictionaryGenerationJobsTable.format);
        abort(input.context);
        const [reviews] = await this.database
            .select({
                accepted: sql<number>`count(*) filter (where ${dictionaryGenerationProposalsTable.reviewState} = 'accepted' and ${dictionaryGenerationProposalsTable.terminalAt} >= ${windowStartedAt}::timestamptz)`,
                discarded: sql<number>`count(*) filter (where ${dictionaryGenerationProposalsTable.reviewState} = 'discarded' and ${dictionaryGenerationProposalsTable.terminalAt} >= ${windowStartedAt}::timestamptz)`,
                expired: sql<number>`count(*) filter (where ${dictionaryGenerationProposalsTable.reviewState} = 'expired' and ${dictionaryGenerationProposalsTable.terminalAt} >= ${windowStartedAt}::timestamptz)`,
            })
            .from(dictionaryGenerationProposalsTable)
            .where(
                gte(
                    dictionaryGenerationProposalsTable.terminalAt,
                    input.windowStartedAt,
                ),
            );
        abort(input.context);
        const [documents] = await this.database
            .select({
                cleanupFailures: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.cleanupState} <> 'complete' and ${dictionaryDocumentUploadsTable.cleanupFailureCategory} is not null)`,
                cleanupOldestLagMs: sql<number>`coalesce(greatest(0, extract(epoch from (${observedAt}::timestamptz - (min(coalesce(${dictionaryDocumentUploadsTable.terminalAt}, ${dictionaryDocumentUploadsTable.updatedAt})) filter (where ${dictionaryDocumentUploadsTable.cleanupState} in ('pending', 'running', 'waiting_capability_expiry'))))) * 1000), 0)::bigint`,
                cleanupPending: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.cleanupState} = 'pending')`,
                cleanupRetries: sql<number>`coalesce(sum(greatest(${dictionaryDocumentUploadsTable.cleanupAttemptCount} - 1, 0)) filter (where ${dictionaryDocumentUploadsTable.cleanupState} <> 'complete'), 0)::bigint`,
                cleanupRunning: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.cleanupState} = 'running')`,
                cleanupWaiting: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.cleanupState} = 'waiting_capability_expiry')`,
                scannerFailures: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.scannerOutcome} in ('infected', 'unavailable', 'timeout', 'limit_exceeded', 'invalid_response', 'stale_signatures') and ${dictionaryDocumentUploadsTable.scanCompletedAt} >= ${windowStartedAt}::timestamptz)`,
                authorizations: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.createdAt} >= ${windowStartedAt}::timestamptz)`,
                completions: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.uploadCompletedAt} >= ${windowStartedAt}::timestamptz)`,
                authorizedBytes: sql<number>`coalesce(sum(${dictionaryDocumentUploadsTable.expectedSizeBytes}) filter (where ${dictionaryDocumentUploadsTable.createdAt} >= ${windowStartedAt}::timestamptz), 0)::bigint`,
                smallUploads: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.createdAt} >= ${windowStartedAt}::timestamptz and ${dictionaryDocumentUploadsTable.expectedSizeBytes} <= 1048576)`,
                mediumUploads: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.createdAt} >= ${windowStartedAt}::timestamptz and ${dictionaryDocumentUploadsTable.expectedSizeBytes} > 1048576 and ${dictionaryDocumentUploadsTable.expectedSizeBytes} <= 8388608)`,
                largeUploads: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.createdAt} >= ${windowStartedAt}::timestamptz and ${dictionaryDocumentUploadsTable.expectedSizeBytes} > 8388608)`,
                pendingPhysicalBytes: sql<number>`coalesce(sum(${dictionaryDocumentUploadsTable.accountedPhysicalBytes}) filter (where ${dictionaryDocumentUploadsTable.quotaReleasedAt} is null), 0)::bigint`,
                scanCompletions: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.scanCompletedAt} >= ${windowStartedAt}::timestamptz)`,
                scanAverageDurationMs: sql<number>`coalesce(avg(extract(epoch from (${dictionaryDocumentUploadsTable.scanCompletedAt} - ${dictionaryDocumentUploadsTable.uploadCompletedAt})) * 1000) filter (where ${dictionaryDocumentUploadsTable.scanCompletedAt} >= ${windowStartedAt}::timestamptz), 0)::bigint`,
                scanClean: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.scannerOutcome} = 'clean' and ${dictionaryDocumentUploadsTable.scanCompletedAt} >= ${windowStartedAt}::timestamptz)`,
                scanInfected: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.scannerOutcome} = 'infected' and ${dictionaryDocumentUploadsTable.scanCompletedAt} >= ${windowStartedAt}::timestamptz)`,
                scanUnavailable: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.scannerOutcome} = 'unavailable' and ${dictionaryDocumentUploadsTable.scanCompletedAt} >= ${windowStartedAt}::timestamptz)`,
                scanTimeout: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.scannerOutcome} = 'timeout' and ${dictionaryDocumentUploadsTable.scanCompletedAt} >= ${windowStartedAt}::timestamptz)`,
                scanLimitExceeded: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.scannerOutcome} = 'limit_exceeded' and ${dictionaryDocumentUploadsTable.scanCompletedAt} >= ${windowStartedAt}::timestamptz)`,
                scanInvalidResponse: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.scannerOutcome} = 'invalid_response' and ${dictionaryDocumentUploadsTable.scanCompletedAt} >= ${windowStartedAt}::timestamptz)`,
                scanStaleSignature: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.scannerOutcome} = 'stale_signatures' and ${dictionaryDocumentUploadsTable.scanCompletedAt} >= ${windowStartedAt}::timestamptz)`,
                cleanupLagBreaches: sql<number>`count(*) filter (where ${dictionaryDocumentUploadsTable.cleanupState} in ('pending', 'running', 'waiting_capability_expiry') and coalesce(${dictionaryDocumentUploadsTable.terminalAt}, ${dictionaryDocumentUploadsTable.updatedAt}) <= ${observedAt}::timestamptz - interval '24 hours')`,
            })
            .from(dictionaryDocumentUploadsTable)
            .where(
                or(
                    inArray(dictionaryDocumentUploadsTable.cleanupState, [
                        'pending',
                        'running',
                        'waiting_capability_expiry',
                    ]),
                    isNull(dictionaryDocumentUploadsTable.quotaReleasedAt),
                    gte(
                        dictionaryDocumentUploadsTable.createdAt,
                        input.windowStartedAt,
                    ),
                    gte(
                        dictionaryDocumentUploadsTable.uploadCompletedAt,
                        input.windowStartedAt,
                    ),
                    gte(
                        dictionaryDocumentUploadsTable.scanCompletedAt,
                        input.windowStartedAt,
                    ),
                ),
            );
        abort(input.context);
        const [latestScan] = await this.database
            .select({
                signatureUpdatedAt:
                    dictionaryDocumentUploadsTable.scannerSignatureUpdatedAt,
            })
            .from(dictionaryDocumentUploadsTable)
            .where(
                and(
                    isNotNull(dictionaryDocumentUploadsTable.scanCompletedAt),
                    isNotNull(
                        dictionaryDocumentUploadsTable.scannerSignatureUpdatedAt,
                    ),
                ),
            )
            .orderBy(desc(dictionaryDocumentUploadsTable.scanCompletedAt))
            .limit(1);
        abort(input.context);
        const [circuits] = await this.database
            .select({
                failureCount: sql<number>`coalesce(sum(${dictionaryGenerationProviderCircuitTable.consecutiveFailures}), 0)::bigint`,
                openCount: sql<number>`count(*) filter (where ${dictionaryGenerationProviderCircuitTable.openUntil} > ${observedAt}::timestamptz)`,
            })
            .from(dictionaryGenerationProviderCircuitTable);
        abort(input.context);
        const number = (value: unknown) =>
            Math.max(0, Math.round(Number(value ?? 0)));
        const queueFor = (format: string) =>
            formatQueues.find((queue) => queue.format === format);
        const queueAge = (format: string) => {
            const oldestAt = queueFor(format)?.oldestAt;
            return oldestAt
                ? Math.max(
                      0,
                      input.context.now.getTime() -
                          new Date(oldestAt).getTime(),
                  )
                : 0;
        };
        const queuedAndRunning =
            number(jobs?.awaitingUploadDepth) +
            number(jobs?.queuedDepth) +
            number(jobs?.runningDepth);
        return {
            schemaVersion: 1,
            windowSeconds: number(windowMs / 1000),
            queueAwaitingUploadDepth: number(jobs?.awaitingUploadDepth),
            queueQueuedDepth: number(jobs?.queuedDepth),
            queueRunningDepth: number(jobs?.runningDepth),
            queueRetryDepth: number(jobs?.retryDepth),
            queueOldestRunnableAgeMs: number(jobs?.oldestRunnableAgeMs),
            queueSingleCardDepth: number(
                queueFor(dictionaryGenerationFormat)?.depth,
            ),
            queuePastedTermsDepth: number(
                queueFor(dictionaryPastedTermsGenerationFormat)?.depth,
            ),
            queueDocumentTermsDepth: number(
                queueFor(dictionaryDocumentGenerationFormat)?.depth,
            ),
            queueImportPairsDepth: number(
                queueFor(dictionaryImportPairsGenerationFormat)?.depth,
            ),
            queueCardAuthoringDepth: number(
                queueFor(dictionaryCardAuthoringGenerationFormat)?.depth,
            ),
            queueSingleCardOldestAgeMs: queueAge(dictionaryGenerationFormat),
            queuePastedTermsOldestAgeMs: queueAge(
                dictionaryPastedTermsGenerationFormat,
            ),
            queueDocumentTermsOldestAgeMs: queueAge(
                dictionaryDocumentGenerationFormat,
            ),
            queueImportPairsOldestAgeMs: queueAge(
                dictionaryImportPairsGenerationFormat,
            ),
            queueCardAuthoringOldestAgeMs: queueAge(
                dictionaryCardAuthoringGenerationFormat,
            ),
            expiredRunningLeaseDepth: number(jobs?.expiredRunningLeases),
            generationQueueCapacityRemaining: Math.max(
                0,
                generationLimits.globalQueued - queuedAndRunning,
            ),
            ownersAtGenerationQueueCapacity: number(jobs?.ownersAtCapacity),
            outcomeCompletedCount: number(terminalJobs?.completedCount),
            outcomeFailedCount: number(terminalJobs?.failedCount),
            outcomeCancelledCount: number(terminalJobs?.cancelledCount),
            outcomeExpiredCount: number(terminalJobs?.expiredCount),
            reviewAcceptedCount: number(reviews?.accepted),
            reviewDiscardedCount: number(reviews?.discarded),
            reviewExpiredCount: number(reviews?.expired),
            processingAverageDurationMs: number(
                terminalJobs?.averageDurationMs,
            ),
            processingMaximumDurationMs: number(
                terminalJobs?.maximumDurationMs,
            ),
            retryAttemptCount: number(terminalJobs?.retryAttempts),
            failureInvalidModelOutputCount: number(
                terminalJobs?.invalidModelOutputFailures,
            ),
            failureProviderUnavailableCount: number(
                terminalJobs?.providerUnavailableFailures,
            ),
            failureProviderTimeoutCount: number(
                terminalJobs?.providerTimeoutFailures,
            ),
            failureProviderRateLimitedCount: number(
                terminalJobs?.providerRateLimitedFailures,
            ),
            failureMalwareDetectedCount: number(terminalJobs?.malwareFailures),
            failureScanCount: number(terminalJobs?.scanFailures),
            failureInvalidDocumentCount: number(
                terminalJobs?.invalidDocumentFailures,
            ),
            failureExtractionCount: number(terminalJobs?.extractionFailures),
            failureNoTermsFoundCount: number(
                terminalJobs?.noTermsFoundFailures,
            ),
            failureTooManyTermsCount: number(
                terminalJobs?.tooManyTermsFailures,
            ),
            settledProviderReservationAttemptCount: number(
                providerSettlements?.attempts,
            ),
            providerActiveReservationCount: number(
                jobs?.providerActiveReservations,
            ),
            providerActiveCapacityRemaining: Math.max(
                0,
                providerOperationalBudget.globalActiveAttempts -
                    number(jobs?.providerActiveReservations),
            ),
            providerCircuitOpenCount: number(circuits?.openCount),
            providerCircuitFailureCount: number(circuits?.failureCount),
            providerReservedInputTokenCount: number(
                jobs?.providerReservedInputTokens,
            ),
            providerReservedOutputTokenCount: number(
                jobs?.providerReservedOutputTokens,
            ),
            providerReservedCostMicros: number(
                jobs?.providerReservedCostMicros,
            ),
            settledProviderBudgetInputTokenCount: number(
                providerSettlements?.inputTokens,
            ),
            settledProviderBudgetOutputTokenCount: number(
                providerSettlements?.outputTokens,
            ),
            settledProviderBudgetCostMicros: number(
                providerSettlements?.costMicros,
            ),
            scannerFailureCount: number(documents?.scannerFailures),
            ocrFailureCount: number(terminalJobs?.ocrFailures),
            uploadAuthorizationCount: number(documents?.authorizations),
            uploadCompletionCount: number(documents?.completions),
            uploadAuthorizedByteCount: number(documents?.authorizedBytes),
            uploadSmallSizeCount: number(documents?.smallUploads),
            uploadMediumSizeCount: number(documents?.mediumUploads),
            uploadLargeSizeCount: number(documents?.largeUploads),
            uploadPendingPhysicalByteCount: number(
                documents?.pendingPhysicalBytes,
            ),
            scanCompletionCount: number(documents?.scanCompletions),
            scanAverageDurationMs: number(documents?.scanAverageDurationMs),
            scanCleanCount: number(documents?.scanClean),
            scanInfectedCount: number(documents?.scanInfected),
            scanUnavailableCount: number(documents?.scanUnavailable),
            scanTimeoutCount: number(documents?.scanTimeout),
            scanLimitExceededCount: number(documents?.scanLimitExceeded),
            scanInvalidResponseCount: number(documents?.scanInvalidResponse),
            scanStaleSignatureCount: number(documents?.scanStaleSignature),
            parserFailureCount:
                number(terminalJobs?.invalidDocumentFailures) +
                number(terminalJobs?.extractionFailures),
            scannerLatestSignatureAgeMs: latestScan?.signatureUpdatedAt
                ? Math.max(
                      0,
                      input.context.now.getTime() -
                          latestScan.signatureUpdatedAt.getTime(),
                  )
                : 0,
            cleanupPendingDepth: number(documents?.cleanupPending),
            cleanupRunningDepth: number(documents?.cleanupRunning),
            cleanupWaitingCapabilityExpiryDepth: number(
                documents?.cleanupWaiting,
            ),
            cleanupFailureDepth: number(documents?.cleanupFailures),
            cleanupOldestLagMs: number(documents?.cleanupOldestLagMs),
            cleanupRetryAttemptCount: number(documents?.cleanupRetries),
            cleanupLagBreachDepth: number(documents?.cleanupLagBreaches),
        };
    }

    private workerCas(input: {
        context: DictionaryOperationContext;
        fencingToken: bigint;
        jobId: string;
        leaseDeadline: Date;
        workerId: string;
    }) {
        return and(
            eq(dictionaryGenerationJobsTable.id, input.jobId),
            eq(dictionaryGenerationJobsTable.executionState, 'running'),
            eq(dictionaryGenerationJobsTable.workerId, input.workerId),
            eq(dictionaryGenerationJobsTable.fencingToken, input.fencingToken),
            eq(
                dictionaryGenerationJobsTable.leaseDeadline,
                input.leaseDeadline,
            ),
            gt(dictionaryGenerationJobsTable.leaseDeadline, input.context.now),
        );
    }

    private async lockOwnedJob(
        tx: Transaction,
        ownerId: string,
        jobId: string,
    ) {
        const [job] = await tx
            .select()
            .from(dictionaryGenerationJobsTable)
            .where(
                and(
                    eq(dictionaryGenerationJobsTable.id, jobId),
                    eq(dictionaryGenerationJobsTable.ownerId, ownerId),
                ),
            )
            .for('update');
        if (!job) throw new DictionaryGenerationJobNotFoundError();
        return job;
    }

    private async lockProposal(tx: Transaction, jobId: string) {
        const [proposal] = await tx
            .select()
            .from(dictionaryGenerationProposalsTable)
            .where(eq(dictionaryGenerationProposalsTable.jobId, jobId))
            .for('update');
        return proposal ?? null;
    }

    private async lockCardSnapshot(tx: Transaction, job: JobRow) {
        const [current] = await tx
            .select({
                card: dictionaryCardsTable,
                dictionary: dictionariesTable,
                settings: dictionarySettingsTable,
            })
            .from(dictionariesTable)
            .innerJoin(
                dictionarySettingsTable,
                eq(dictionarySettingsTable.dictionaryId, dictionariesTable.id),
            )
            .innerJoin(
                dictionaryCardsTable,
                and(
                    eq(dictionaryCardsTable.id, job.cardId!),
                    eq(dictionaryCardsTable.dictionaryId, dictionariesTable.id),
                ),
            )
            .where(
                and(
                    eq(dictionariesTable.id, job.dictionaryId),
                    eq(dictionariesTable.ownerId, job.ownerId),
                ),
            )
            .for('update');
        if (!current) throw new DictionaryGenerationJobNotFoundError();
        return current;
    }

    private async assertGenerationAdmission(
        tx: Transaction,
        ownerId: string,
        format: string,
        now: Date,
    ): Promise<void> {
        const [providerCircuit] = await tx
            .select({
                openUntil: dictionaryGenerationProviderCircuitTable.openUntil,
            })
            .from(dictionaryGenerationProviderCircuitTable)
            .where(eq(dictionaryGenerationProviderCircuitTable.id, format))
            .limit(1);
        if (providerCircuit?.openUntil && providerCircuit.openUntil > now)
            throw new DictionaryGenerationNotAvailableError();

        const [counts] = await tx
            .select({
                global: count(),
                oldestRunnableQueuedAt: sql<
                    string | null
                >`min(${dictionaryGenerationJobsTable.createdAt}) filter (where ${dictionaryGenerationJobsTable.executionState} = 'queued' and ${dictionaryGenerationJobsTable.nextAttemptAt} <= ${now.toISOString()}::timestamptz)`,
                owner: sql<number>`count(*) filter (where ${dictionaryGenerationJobsTable.ownerId} = ${ownerId})`,
            })
            .from(dictionaryGenerationJobsTable)
            .where(
                inArray(dictionaryGenerationJobsTable.executionState, [
                    'queued',
                    'running',
                ]),
            );
        if (
            Number(counts?.global ?? 0) >= generationLimits.globalQueued ||
            Number(counts?.owner ?? 0) >= generationLimits.ownerQueued ||
            (counts?.oldestRunnableQueuedAt !== null &&
                counts?.oldestRunnableQueuedAt !== undefined &&
                new Date(counts.oldestRunnableQueuedAt).getTime() <=
                    now.getTime() - generationLimits.maxRunnableQueueAgeMs)
        )
            throw new DictionaryGenerationNotAvailableError();
        const providerAdmission = await this.providerBudgetUsage(
            tx,
            ownerId,
            now,
        );
        if (
            !dictionaryGenerationProviderBudgetAllows(
                providerAdmission,
                true,
                this.providerBudget,
            )
        )
            throw new DictionaryGenerationNotAvailableError();
    }

    private async providerBudgetUsage(
        tx: Transaction,
        ownerId: string,
        now: Date,
    ): Promise<DictionaryGenerationProviderBudgetUsage> {
        const windowStart = new Date(now.getTime() - 86_400_000).toISOString();
        const [usage] = await tx
            .select({
                globalActiveCostMicros: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerReservedCostMicros}) filter (where ${dictionaryGenerationJobsTable.providerReservationState} = 'active'), 0)`,
                globalActiveInputTokens: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerReservedInputTokens}) filter (where ${dictionaryGenerationJobsTable.providerReservationState} = 'active'), 0)`,
                globalActiveOutputTokens: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerReservedOutputTokens}) filter (where ${dictionaryGenerationJobsTable.providerReservationState} = 'active'), 0)`,
                globalSettledCostMicros: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerActualCostMicros}) filter (where ${dictionaryGenerationJobsTable.providerReservationState} = 'settled' and ${dictionaryGenerationJobsTable.providerReservationSettledAt} > ${windowStart}::timestamptz), 0)`,
                globalSettledInputTokens: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerActualInputTokens}) filter (where ${dictionaryGenerationJobsTable.providerReservationState} = 'settled' and ${dictionaryGenerationJobsTable.providerReservationSettledAt} > ${windowStart}::timestamptz), 0)`,
                globalSettledOutputTokens: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerActualOutputTokens}) filter (where ${dictionaryGenerationJobsTable.providerReservationState} = 'settled' and ${dictionaryGenerationJobsTable.providerReservationSettledAt} > ${windowStart}::timestamptz), 0)`,
                ownerActiveCostMicros: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerReservedCostMicros}) filter (where ${dictionaryGenerationJobsTable.providerReservationState} = 'active' and ${dictionaryGenerationJobsTable.ownerId} = ${ownerId}), 0)`,
                ownerActiveInputTokens: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerReservedInputTokens}) filter (where ${dictionaryGenerationJobsTable.providerReservationState} = 'active' and ${dictionaryGenerationJobsTable.ownerId} = ${ownerId}), 0)`,
                ownerActiveOutputTokens: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerReservedOutputTokens}) filter (where ${dictionaryGenerationJobsTable.providerReservationState} = 'active' and ${dictionaryGenerationJobsTable.ownerId} = ${ownerId}), 0)`,
                ownerSettledCostMicros: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerActualCostMicros}) filter (where ${dictionaryGenerationJobsTable.providerReservationState} = 'settled' and ${dictionaryGenerationJobsTable.ownerId} = ${ownerId} and ${dictionaryGenerationJobsTable.providerReservationSettledAt} > ${windowStart}::timestamptz), 0)`,
                ownerSettledInputTokens: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerActualInputTokens}) filter (where ${dictionaryGenerationJobsTable.providerReservationState} = 'settled' and ${dictionaryGenerationJobsTable.ownerId} = ${ownerId} and ${dictionaryGenerationJobsTable.providerReservationSettledAt} > ${windowStart}::timestamptz), 0)`,
                ownerSettledOutputTokens: sql<number>`coalesce(sum(${dictionaryGenerationJobsTable.providerActualOutputTokens}) filter (where ${dictionaryGenerationJobsTable.providerReservationState} = 'settled' and ${dictionaryGenerationJobsTable.ownerId} = ${ownerId} and ${dictionaryGenerationJobsTable.providerReservationSettledAt} > ${windowStart}::timestamptz), 0)`,
            })
            .from(dictionaryGenerationJobsTable);
        return {
            globalActiveCostMicros: Number(usage?.globalActiveCostMicros ?? 0),
            globalActiveInputTokens: Number(
                usage?.globalActiveInputTokens ?? 0,
            ),
            globalActiveOutputTokens: Number(
                usage?.globalActiveOutputTokens ?? 0,
            ),
            globalSettledCostMicros: Number(
                usage?.globalSettledCostMicros ?? 0,
            ),
            globalSettledInputTokens: Number(
                usage?.globalSettledInputTokens ?? 0,
            ),
            globalSettledOutputTokens: Number(
                usage?.globalSettledOutputTokens ?? 0,
            ),
            ownerActiveCostMicros: Number(usage?.ownerActiveCostMicros ?? 0),
            ownerActiveInputTokens: Number(usage?.ownerActiveInputTokens ?? 0),
            ownerActiveOutputTokens: Number(
                usage?.ownerActiveOutputTokens ?? 0,
            ),
            ownerSettledCostMicros: Number(usage?.ownerSettledCostMicros ?? 0),
            ownerSettledInputTokens: Number(
                usage?.ownerSettledInputTokens ?? 0,
            ),
            ownerSettledOutputTokens: Number(
                usage?.ownerSettledOutputTokens ?? 0,
            ),
        };
    }

    private async readView(tx: Transaction, job: JobRow, now: Date) {
        const [proposal] = await tx
            .select()
            .from(dictionaryGenerationProposalsTable)
            .where(eq(dictionaryGenerationProposalsTable.jobId, job.id))
            .limit(1)
            .for('update');
        if (
            proposal?.reviewState === 'reviewable' &&
            (!proposal.documentStagedAt || proposal.documentPublishedAt) &&
            proposal.expiresAt <= now
        ) {
            await this.expireProposal(tx, job.id, now);
            return mapJob(
                { ...job, inputPayload: null, updatedAt: now },
                {
                    ...proposal,
                    payload: null,
                    reviewState: 'expired',
                    terminalAt: now,
                    updatedAt: now,
                },
            );
        }
        return mapJob(job, proposal ?? null);
    }

    private async expireProposal(tx: Transaction, jobId: string, now: Date) {
        await tx
            .update(dictionaryGenerationProposalsTable)
            .set({
                payload: null,
                reviewState: 'expired',
                terminalAt: now,
                updatedAt: now,
            })
            .where(
                and(
                    eq(dictionaryGenerationProposalsTable.jobId, jobId),
                    eq(
                        dictionaryGenerationProposalsTable.reviewState,
                        'reviewable',
                    ),
                ),
            );
        await tx
            .update(dictionaryGenerationJobsTable)
            .set({ inputPayload: null, updatedAt: now })
            .where(eq(dictionaryGenerationJobsTable.id, jobId));
    }

    private async recordProviderFailure(
        tx: Transaction,
        format: string,
        now: Date,
    ) {
        await tx
            .insert(dictionaryGenerationProviderCircuitTable)
            .values({
                consecutiveFailures: 0,
                id: format,
                updatedAt: now,
            })
            .onConflictDoNothing();
        const [circuit] = await tx
            .select()
            .from(dictionaryGenerationProviderCircuitTable)
            .where(eq(dictionaryGenerationProviderCircuitTable.id, format))
            .for('update');
        const consecutiveFailures = (circuit?.consecutiveFailures ?? 0) + 1;
        await tx
            .update(dictionaryGenerationProviderCircuitTable)
            .set({
                consecutiveFailures,
                openUntil:
                    consecutiveFailures >=
                    providerOperationalBudget.circuitFailureThreshold
                        ? new Date(
                              now.getTime() +
                                  providerOperationalBudget.circuitOpenMs,
                          )
                        : circuit?.openUntil,
                updatedAt: now,
            })
            .where(eq(dictionaryGenerationProviderCircuitTable.id, format));
    }

    private async recordProviderSuccess(
        tx: Transaction,
        format: string,
        now: Date,
    ) {
        await tx
            .insert(dictionaryGenerationProviderCircuitTable)
            .values({
                consecutiveFailures: 0,
                id: format,
                openUntil: null,
                updatedAt: now,
            })
            .onConflictDoUpdate({
                set: {
                    consecutiveFailures: 0,
                    openUntil: null,
                    updatedAt: now,
                },
                target: dictionaryGenerationProviderCircuitTable.id,
            });
    }

    private async terminalizeCancelled(
        tx: Transaction,
        job: JobRow,
        now: Date,
    ) {
        await tx
            .update(dictionaryGenerationJobsTable)
            .set({
                completedAt: now,
                executionState: 'cancelled',
                heartbeatAt: null,
                inputPayload: null,
                leaseDeadline: null,
                progressPercent: 100,
                progressStage: 'terminal',
                providerActualCostMicros: job.providerReservedCostMicros,
                providerActualInputTokens: job.providerReservedInputTokens,
                providerActualOutputTokens: job.providerReservedOutputTokens,
                providerReservationSettledAt: now,
                providerReservationState: 'settled',
                updatedAt: now,
                workerId: null,
            })
            .where(
                and(
                    eq(dictionaryGenerationJobsTable.id, job.id),
                    eq(dictionaryGenerationJobsTable.executionState, 'running'),
                    eq(dictionaryGenerationJobsTable.workerId, job.workerId!),
                    eq(
                        dictionaryGenerationJobsTable.fencingToken,
                        job.fencingToken,
                    ),
                    eq(
                        dictionaryGenerationJobsTable.leaseDeadline,
                        job.leaseDeadline!,
                    ),
                ),
            );
        if (job.kind === 'document-terms')
            await this.scheduleDocumentCleanup(tx, job.id, now, 'cancelled');
    }

    private async scheduleDocumentCleanup(
        tx: Transaction,
        jobId: string,
        now: Date,
        processingState: 'cancelled' | 'failed',
    ) {
        await tx
            .update(dictionaryDocumentUploadsTable)
            .set({
                cleanupNextAttemptAt: now,
                cleanupState: 'pending',
                processingState,
                terminalAt: now,
                updatedAt: now,
            })
            .where(eq(dictionaryDocumentUploadsTable.jobId, jobId));
    }
}
