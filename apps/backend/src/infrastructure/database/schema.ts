export {
    userEmailsTable,
    usersTable,
    userStatusEnum,
} from '../../modules/users/infrastructure/persistence/drizzle/schema';
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
    dictionariesTable,
    dictionaryCardAuthorshipEnum,
    dictionaryCardMutationKindEnum,
    dictionaryCardRevisionsTable,
    dictionaryCardsTable,
    dictionaryDocumentExtractionsTable,
    dictionaryDocumentObjectVersionsTable,
    dictionaryDocumentUploadsTable,
    dictionaryEnablementEnum,
    dictionaryGenerationExecutionStateEnum,
    dictionaryGenerationJobsTable,
    dictionaryGenerationProposalsTable,
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
import {
    dictionariesTable,
    dictionaryCardRevisionsTable,
    dictionaryCardsTable,
    dictionaryDocumentExtractionsTable,
    dictionaryDocumentObjectVersionsTable,
    dictionaryDocumentUploadsTable,
    dictionaryGenerationJobsTable,
    dictionaryGenerationProposalsTable,
    dictionaryGenerationProviderCircuitTable,
    dictionaryIdempotencyKeysTable,
    dictionarySettingsTable,
} from '../../modules/dictionaries/infrastructure/persistence/drizzle/schema';

export const databaseSchema = {
    adminAuditEvents: adminAuditEventsTable,
    adminMemberships: adminMembershipsTable,
    authPasskeys: authPasskeysTable,
    authSecurityEvents: authSecurityEventsTable,
    authSessions: authSessionsTable,
    authVerificationChallenges: authVerificationChallengesTable,
    dictionaries: dictionariesTable,
    dictionaryCardRevisions: dictionaryCardRevisionsTable,
    dictionaryCards: dictionaryCardsTable,
    dictionaryDocumentExtractions: dictionaryDocumentExtractionsTable,
    dictionaryDocumentObjectVersions: dictionaryDocumentObjectVersionsTable,
    dictionaryDocumentUploads: dictionaryDocumentUploadsTable,
    dictionaryGenerationJobs: dictionaryGenerationJobsTable,
    dictionaryGenerationProposals: dictionaryGenerationProposalsTable,
    dictionaryGenerationProviderCircuit:
        dictionaryGenerationProviderCircuitTable,
    dictionaryIdempotencyKeys: dictionaryIdempotencyKeysTable,
    dictionarySettings: dictionarySettingsTable,
    passwordCredentials: passwordCredentialsTable,
    userEmails: userEmailsTable,
    users: usersTable,
};
