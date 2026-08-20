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

export const databaseSchema = {
    adminAuditEvents: adminAuditEventsTable,
    adminMemberships: adminMembershipsTable,
    authPasskeys: authPasskeysTable,
    authSecurityEvents: authSecurityEventsTable,
    authSessions: authSessionsTable,
    authVerificationChallenges: authVerificationChallengesTable,
    passwordCredentials: passwordCredentialsTable,
    userEmails: userEmailsTable,
    users: usersTable,
};
