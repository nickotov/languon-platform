export {
    userEmailsTable,
    usersTable,
    userStatusEnum,
} from '../../modules/users/infrastructure/persistence/drizzle/schema';
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
    dictionaryAiConfigurationRevisionsTable,
    dictionaryAiConfigurationTable,
    dictionaryAiWorkerObservationsTable,
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
    dictionaryAiConfigurationRevisionsTable,
    dictionaryAiConfigurationTable,
    dictionaryAiWorkerObservationsTable,
    dictionaryGenerationJobsTable,
    dictionaryGenerationProposalsTable,
    dictionaryGenerationProviderUsageArchiveTable,
    dictionaryGenerationProviderCircuitTable,
    dictionaryIdempotencyKeysTable,
    dictionarySettingsTable,
} from '../../modules/dictionaries/infrastructure/persistence/drizzle/schema';

export {
    dictionaryAudioAssetsTable,
    dictionaryAudioJobsTable,
    dictionaryAudioBindingsTable,
    dictionaryAudioBlobsTable,
} from '../../modules/dictionaries/infrastructure/persistence/drizzle/audio-schema';
import {
    dictionaryAudioAssetsTable,
    dictionaryAudioJobsTable,
    dictionaryAudioBindingsTable,
    dictionaryAudioBlobsTable,
} from '../../modules/dictionaries/infrastructure/persistence/drizzle/audio-schema';

export const databaseSchema = {
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
    dictionaryAudioAssets: dictionaryAudioAssetsTable,
    dictionaryAudioJobs: dictionaryAudioJobsTable,
    dictionaryAudioBindings: dictionaryAudioBindingsTable,
    dictionaryAudioBlobs: dictionaryAudioBlobsTable,
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
