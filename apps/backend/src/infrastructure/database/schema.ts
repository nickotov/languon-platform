import * as adminMcpSchema from '../../modules/admin-mcp/infrastructure/persistence/drizzle/schema';
export * from '../../modules/admin-mcp/infrastructure/persistence/drizzle/schema';
import * as textAiRouteHealthSchema from '../../modules/text-ai/infrastructure/persistence/drizzle/route-health-schema';
export * from '../../modules/text-ai/infrastructure/persistence/drizzle/route-health-schema';
import * as textAiRoutingSchema from '../../modules/text-ai/infrastructure/persistence/drizzle/routing-schema';
import * as textAiProbeSchema from '../../modules/text-ai/infrastructure/persistence/drizzle/probe-schema';
import * as textAiRouteDispatchSchema from '../../modules/text-ai/infrastructure/persistence/drizzle/route-dispatch-schema';
export * from '../../modules/text-ai/infrastructure/persistence/drizzle/routing-schema';
export * from '../../modules/text-ai/infrastructure/persistence/drizzle/probe-schema';
export * from '../../modules/text-ai/infrastructure/persistence/drizzle/route-dispatch-schema';
import * as portraitCallSchema from '../../modules/learner-portraits/infrastructure/persistence/drizzle/provider-call-schema';
import * as accountingSchema from '../../modules/ai-credits/infrastructure/persistence/drizzle/accounting-schema';
import * as actionAccountingSchema from '../../modules/ai-credits/infrastructure/persistence/drizzle/action-accounting-schema';
import * as actionAuthoritySchema from '../../modules/ai-credits/infrastructure/persistence/drizzle/action-authority-schema';
import * as operatorBudgetSchema from '../../modules/ai-credits/infrastructure/persistence/drizzle/operator-budget-schema';
import * as capabilityPolicySchema from '../../modules/ai-credits/infrastructure/persistence/drizzle/capability-policy-schema';
import * as providerPriceSchema from '../../modules/ai-credits/infrastructure/persistence/drizzle/provider-price-schema';
import * as capacitySchema from '../text-ai/capacity-schema';
import {
    aiCreditGrantBalancesTable,
    aiCreditWalletTotalsTable,
} from '../../modules/ai-credits/infrastructure/persistence/drizzle/schema';
import * as learnerPortraitSchema from '../../modules/learner-portraits/infrastructure/persistence/drizzle/schema';
import { speechAudioBlobsTable } from '../../modules/speech/infrastructure/blob-schema';
import { navigationResourcesTable } from '../../modules/navigation/infrastructure/persistence/drizzle/schema';
export { navigationResourcesTable } from '../../modules/navigation/infrastructure/persistence/drizzle/schema';
export { speechAudioBlobsTable } from '../../modules/speech/infrastructure/blob-schema';
import * as knowledgeSchema from '../../modules/knowledge/infrastructure/persistence/drizzle/schema';
import * as conversationSchema from '../../modules/conversations/infrastructure/persistence/drizzle/schema';
import * as conversationCallSchema from '../../modules/conversations/infrastructure/persistence/drizzle/conversation-provider-call-schema';
import * as dictionaryTextSelectionSchema from '../../modules/dictionaries/infrastructure/persistence/drizzle/selection-card-schema';
import * as textsJobSchema from '../../modules/texts/infrastructure/persistence/drizzle/texts-job-schema';
import * as textsContentSchema from '../../modules/texts/infrastructure/persistence/drizzle/schema';
import * as sentenceLibrarySchema from '../../modules/learning/infrastructure/persistence/drizzle/sentence-library-schema';
import * as sentencePreparationSchema from '../../modules/learning/infrastructure/persistence/drizzle/sentence-preparation-schema';
import * as sentenceSchema from '../../modules/learning/infrastructure/persistence/drizzle/sentence-schema';
import * as speechSchema from '../../modules/speech/infrastructure/schema';
import { modelPriceRevisionsTable } from '../../modules/ai-credits/infrastructure/persistence/drizzle/model-price-schema';
import {
    dictionaryAiConfigurationRevisionsTable,
    dictionaryAiConfigurationTable,
    dictionaryAiWorkerObservationsTable,
} from '../../modules/text-ai/infrastructure/persistence/drizzle/configuration-schema';
export {
    userEmailsTable,
    usersTable,
    userStatusEnum,
} from '../../modules/users/infrastructure/persistence/drizzle/schema';
export { textAiPreferencesTable } from '../../modules/text-ai/infrastructure/persistence/drizzle/schema';
export {
    dictionaryAiConfigurationRevisionsTable,
    dictionaryAiConfigurationTable,
    dictionaryAiWorkerObservationsTable,
} from '../../modules/text-ai/infrastructure/persistence/drizzle/configuration-schema';
import { textAiPreferencesTable } from '../../modules/text-ai/infrastructure/persistence/drizzle/schema';
export {
    accountDeletionRequestsTable,
    accountDeletionStateEnum,
} from '../../modules/users/infrastructure/persistence/drizzle/account-deletion-schema';
export {
    authPasskeyDeviceTypeEnum,
    authPasskeysTable,
    authSecurityEventOutcomeEnum,
    authSecurityEventsTable,
    authSessionMethodEnum,
    authSessionsTable,
    authVerificationChallengesTable,
    authVerificationPurposeEnum,
    passwordCredentialsTable,
} from '../../modules/authentication/infrastructure/persistence/drizzle/schema';
export {
    adminAuditActionEnum,
    adminAuditEventsTable,
    adminAuditOutcomeEnum,
    adminMembershipRoleEnum,
    adminMembershipsTable,
} from '../../modules/administration/infrastructure/persistence/drizzle/schema';
export {
    aiCreditAccountsTable,
    aiCreditAdminRemovalAllocationsTable,
    aiCreditAdminRemovalsTable,
    aiCreditGrantSourceEnum,
    aiCreditGrantsTable,
    aiCreditHistoryKindEnum,
    aiCreditHistoryTable,
    aiCreditMeasurementEnum,
    aiCreditPolicyModeEnum,
    aiCreditReservationAllocationsTable,
    aiCreditReservationsTable,
    aiCreditReservationStateEnum,
} from '../../modules/ai-credits/infrastructure/persistence/drizzle/schema';
export {
    dictionariesTable,
    dictionaryCardAuthorshipEnum,
    dictionaryCardMutationKindEnum,
    dictionaryCardRevisionsTable,
    dictionaryCardsTable,
    dictionaryDeletionReceiptsTable,
    dictionaryDocumentExtractionsTable,
    dictionaryDocumentObjectVersionsTable,
    dictionaryDocumentUploadsTable,
    dictionaryEnablementEnum,
    dictionaryGenerationExecutionStateEnum,
    dictionaryGenerationJobsTable,
    dictionaryGenerationProposalsTable,
    dictionaryGenerationProviderUsageArchiveTable,
    dictionaryGenerationProviderCircuitTable,
    dictionaryGenerationReviewStateEnum,
    dictionaryIdempotencyKeysTable,
    dictionaryIdempotencyOperationEnum,
    dictionaryIdempotencyStateEnum,
    dictionaryLanguageRoleEnum,
    dictionaryLifecycleEnum,
    dictionarySettingsTable,
    dictionaryTranscriptionNotationEnum,
    dictionaryVisibilityEnum,
} from '../../modules/dictionaries/infrastructure/persistence/drizzle/schema';

import {
    adminAuditEventsTable,
    adminMembershipsTable,
} from '../../modules/administration/infrastructure/persistence/drizzle/schema';
import {
    aiCreditAccountsTable,
    aiCreditAdminRemovalAllocationsTable,
    aiCreditAdminRemovalsTable,
    aiCreditGrantsTable,
    aiCreditHistoryTable,
    aiCreditReservationAllocationsTable,
    aiCreditReservationsTable,
} from '../../modules/ai-credits/infrastructure/persistence/drizzle/schema';

import {
    authPasskeysTable,
    authSecurityEventsTable,
    authSessionsTable,
    authVerificationChallengesTable,
    passwordCredentialsTable,
} from '../../modules/authentication/infrastructure/persistence/drizzle/schema';

import {
    userEmailsTable,
    usersTable,
} from '../../modules/users/infrastructure/persistence/drizzle/schema';
import { accountDeletionRequestsTable } from '../../modules/users/infrastructure/persistence/drizzle/account-deletion-schema';
import {
    dictionariesTable,
    dictionaryCardRevisionsTable,
    dictionaryCardsTable,
    dictionaryDeletionReceiptsTable,
    dictionaryDocumentExtractionsTable,
    dictionaryDocumentObjectVersionsTable,
    dictionaryDocumentUploadsTable,
    dictionaryGenerationJobsTable,
    dictionaryGenerationProposalsTable,
    dictionaryGenerationProviderUsageArchiveTable,
    dictionaryGenerationProviderCircuitTable,
    dictionaryIdempotencyKeysTable,
    dictionarySettingsTable,
} from '../../modules/dictionaries/infrastructure/persistence/drizzle/schema';

export const databaseSchema = {
    ...adminMcpSchema,
    ...textAiRouteHealthSchema,
    ...textAiRoutingSchema,
    ...textAiProbeSchema,
    ...textAiRouteDispatchSchema,
    ...accountingSchema,
    ...actionAccountingSchema,
    ...operatorBudgetSchema,
    ...actionAuthoritySchema,
    ...capabilityPolicySchema,
    ...providerPriceSchema,
    ...capacitySchema,
    aiCreditGrantBalances: aiCreditGrantBalancesTable,
    aiCreditWalletTotals: aiCreditWalletTotalsTable,
    ...learnerPortraitSchema,
    ...portraitCallSchema,
    navigationResources: navigationResourcesTable,
    speechAudioBlobs: speechAudioBlobsTable,
    ...knowledgeSchema,
    ...conversationSchema,
    ...conversationCallSchema,
    ...dictionaryTextSelectionSchema,
    ...textsJobSchema,
    ...textsContentSchema,
    ...speechSchema,
    modelPriceRevisions: modelPriceRevisionsTable,
    ...sentenceSchema,
    ...sentenceLibrarySchema,
    ...sentencePreparationSchema,
    textAiPreferences: textAiPreferencesTable,
    flashcardPreferences: flashcardPreferencesTable,
    flashcardAttempts: flashcardAttemptsTable,
    flashcardEntryProgress: flashcardEntryProgressTable,
    aiCreditAccounts: aiCreditAccountsTable,
    aiCreditAdminRemovalAllocations: aiCreditAdminRemovalAllocationsTable,
    aiCreditAdminRemovals: aiCreditAdminRemovalsTable,
    aiCreditGrants: aiCreditGrantsTable,
    aiCreditHistory: aiCreditHistoryTable,
    aiCreditReservationAllocations: aiCreditReservationAllocationsTable,
    aiCreditReservations: aiCreditReservationsTable,
    accountDeletionRequests: accountDeletionRequestsTable,
    adminAuditEvents: adminAuditEventsTable,
    adminMemberships: adminMembershipsTable,
    authPasskeys: authPasskeysTable,
    authSecurityEvents: authSecurityEventsTable,
    authSessions: authSessionsTable,
    authVerificationChallenges: authVerificationChallengesTable,
    dictionaries: dictionariesTable,
    dictionaryCardRevisions: dictionaryCardRevisionsTable,
    dictionaryCards: dictionaryCardsTable,
    dictionaryDeletionReceipts: dictionaryDeletionReceiptsTable,
    dictionaryDocumentExtractions: dictionaryDocumentExtractionsTable,
    dictionaryDocumentObjectVersions: dictionaryDocumentObjectVersionsTable,
    dictionaryDocumentUploads: dictionaryDocumentUploadsTable,
    dictionaryAiConfiguration: dictionaryAiConfigurationTable,
    dictionaryAiConfigurationRevisions: dictionaryAiConfigurationRevisionsTable,
    dictionaryAiWorkerObservations: dictionaryAiWorkerObservationsTable,
    dictionaryGenerationJobs: dictionaryGenerationJobsTable,
    dictionaryGenerationProposals: dictionaryGenerationProposalsTable,
    dictionaryGenerationProviderUsageArchive:
        dictionaryGenerationProviderUsageArchiveTable,
    dictionaryGenerationProviderCircuit:
        dictionaryGenerationProviderCircuitTable,
    dictionaryIdempotencyKeys: dictionaryIdempotencyKeysTable,
    dictionarySettings: dictionarySettingsTable,
    passwordCredentials: passwordCredentialsTable,
    userEmails: userEmailsTable,
    users: usersTable,
};

export {
    flashcardPreferencesTable,
    flashcardAttemptsTable,
    flashcardEntryProgressTable,
} from '../../modules/learning/infrastructure/persistence/drizzle/schema';
import {
    flashcardPreferencesTable,
    flashcardAttemptsTable,
    flashcardEntryProgressTable,
} from '../../modules/learning/infrastructure/persistence/drizzle/schema';

export * from '../../modules/learning/infrastructure/persistence/drizzle/sentence-schema';

export * from '../../modules/learning/infrastructure/persistence/drizzle/sentence-library-schema';
export * from '../../modules/learning/infrastructure/persistence/drizzle/sentence-preparation-schema';
export * from '../../modules/speech/infrastructure/schema';
export * from '../../modules/ai-credits/infrastructure/persistence/drizzle/model-price-schema';

export * from '../../modules/texts/infrastructure/persistence/drizzle/schema';

export * from '../../modules/texts/infrastructure/persistence/drizzle/texts-job-schema';

export * from '../../modules/dictionaries/infrastructure/persistence/drizzle/selection-card-schema';

export * from '../../modules/knowledge/infrastructure/persistence/drizzle/schema';
export * from '../../modules/conversations/infrastructure/persistence/drizzle/schema';
export * from '../../modules/conversations/infrastructure/persistence/drizzle/conversation-provider-call-schema';

export * from '../../modules/learner-portraits/infrastructure/persistence/drizzle/schema';

export * from '../../modules/learner-portraits/infrastructure/persistence/drizzle/provider-call-schema';
export * from '../../modules/ai-credits/infrastructure/persistence/drizzle/accounting-schema';
export * from '../../modules/ai-credits/infrastructure/persistence/drizzle/action-accounting-schema';
export * from '../../modules/ai-credits/infrastructure/persistence/drizzle/operator-budget-schema';
export * from '../../modules/ai-credits/infrastructure/persistence/drizzle/capability-policy-schema';
export * from '../../modules/ai-credits/infrastructure/persistence/drizzle/provider-price-schema';
export * from '../text-ai/capacity-schema';
export { aiCreditGrantBalancesTable, aiCreditWalletTotalsTable };

export * from '../../modules/ai-credits/infrastructure/persistence/drizzle/action-authority-schema';
