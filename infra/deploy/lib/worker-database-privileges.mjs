export function assertDictionaryWorkerDatabasePrivileges(
    privileges,
    { sharedSpeech = false, modelPricing = false } = {},
) {
    if (sharedSpeech && privileges.sharedSpeech !== true) {
        throw new Error(
            'Shared speech worker lacks its required least-privilege execution capabilities.',
        );
    }

    if (modelPricing && privileges.modelPricing !== true) {
        throw new Error('Worker lacks immutable model price read capability.');
    }

    if (
        privileges.jobs !== true ||
        privileges.proposals !== true ||
        privileges.providerCircuit !== true ||
        privileges.documentUploads !== true ||
        privileges.documentObjectVersions !== true ||
        privileges.documentExtractions !== true ||
        privileges.settings !== true ||
        privileges.aiConfiguration !== true ||
        privileges.aiConfigurationRevisions !== true ||
        privileges.aiWorkerObservations !== true ||
        privileges.aiCreditAccounts !== true ||
        privileges.aiCreditGrants !== true ||
        privileges.aiCreditAdminRemovals !== true ||
        privileges.aiCreditAdminRemovalAllocations !== true ||
        privileges.aiCreditReservations !== true ||
        privileges.aiCreditReservationAllocations !== true ||
        privileges.aiCreditHistory !== true ||
        privileges.dictionaryCardDuplicateColumns !== true ||
        privileges.jobsUnexpected !== false ||
        privileges.proposalsUnexpected !== false ||
        privileges.providerCircuitUnexpected !== false ||
        privileges.documentUploadsUnexpected !== false ||
        privileges.documentObjectVersionsUnexpected !== false ||
        privileges.documentExtractionsUnexpected !== false ||
        privileges.settingsUnexpected !== false ||
        privileges.aiConfigurationUnexpected !== false ||
        privileges.aiConfigurationRevisionsUnexpected !== false ||
        privileges.aiWorkerObservationsUnexpected !== false ||
        privileges.aiCreditAccountsUnexpected !== false ||
        privileges.aiCreditGrantsUnexpected !== false ||
        privileges.aiCreditAdminRemovalsUnexpected !== false ||
        privileges.aiCreditAdminRemovalAllocationsUnexpected !== false ||
        privileges.aiCreditReservationsUnexpected !== false ||
        privileges.aiCreditReservationAllocationsUnexpected !== false ||
        privileges.aiCreditHistoryUnexpected !== false ||
        privileges.dictionaries !== false ||
        privileges.dictionaryCards !== false ||
        privileges.dictionaryCardsUnexpectedColumns !== false ||
        privileges.dictionaryCardRevisions !== false ||
        privileges.dictionaryIdempotencyKeys !== false ||
        privileges.schemaCreate !== false ||
        privileges.users !== false ||
        privileges.userEmails !== false ||
        privileges.passwordCredentials !== false ||
        privileges.authVerificationChallenges !== false ||
        privileges.authSessions !== false ||
        privileges.authPasskeys !== false ||
        privileges.authSecurityEvents !== false ||
        privileges.adminMemberships !== false ||
        privileges.adminAuditEvents !== false
    ) {
        throw new Error(
            'Dictionary worker database privileges violate the required least-privilege boundary.',
        );
    }
}

function tablePrivilegeExpression(table, privileges, operator) {
    return `(${privileges
        .map(
            (privilege) =>
                `has_table_privilege(current_user, 'public.${table}', '${privilege}')`,
        )
        .join(` ${operator} `)})`;
}

function columnPrivilegeExpression(table, columns, privilege, operator) {
    return columns
        .map(
            (column) =>
                `has_column_privilege(current_user, 'public.${table}', '${column}', '${privilege}')`,
        )
        .join(` ${operator} `);
}

function unexpectedColumnPrivilegeExpression(table, allowed, privilege) {
    return `exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = '${table}' and column_name not in (${allowed.map((column) => `'${column}'`).join(', ')}) and has_column_privilege(current_user, 'public.${table}', column_name, '${privilege}'))`;
}

const forbiddenTablePrivileges = [
    'SELECT',
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'REFERENCES',
    'TRIGGER',
];

export const SHARED_SPEECH_WORKER_RECORDING_UPDATE_COLUMNS = [
    'state',
    'storage',
    'checksum',
    'byte_length',
    'duration_ms',
    'version',
    'last_accessed_at',
    'deleted_at',
    'text',
];
export const SHARED_SPEECH_WORKER_JOB_UPDATE_COLUMNS = [
    'state',
    'task_id',
    'lease_token',
    'lease_expires_at',
    'next_poll_at',
    'error',
    'billing_state',
];

export const SHARED_SPEECH_WORKER_DATABASE_PRIVILEGE_QUERY = `select (
  has_table_privilege(current_user, 'speech_recordings', 'SELECT') and
  ${columnPrivilegeExpression('speech_recordings', SHARED_SPEECH_WORKER_RECORDING_UPDATE_COLUMNS, 'UPDATE', 'and')} and
  not ${unexpectedColumnPrivilegeExpression('speech_recordings', SHARED_SPEECH_WORKER_RECORDING_UPDATE_COLUMNS, 'UPDATE')} and
  has_table_privilege(current_user, 'speech_jobs', 'SELECT') and
  ${columnPrivilegeExpression('speech_jobs', SHARED_SPEECH_WORKER_JOB_UPDATE_COLUMNS, 'UPDATE', 'and')} and
  not ${unexpectedColumnPrivilegeExpression('speech_jobs', SHARED_SPEECH_WORKER_JOB_UPDATE_COLUMNS, 'UPDATE')} and
  not has_table_privilege(current_user, 'speech_recordings', 'DELETE') and
  not has_table_privilege(current_user, 'speech_jobs', 'DELETE') and
  not has_table_privilege(current_user, 'speech_quotes', 'SELECT')
) as "sharedSpeech"`;

export const MODEL_PRICING_WORKER_DATABASE_PRIVILEGE_QUERY = `select (
  has_table_privilege(current_user, 'model_price_revisions', 'SELECT') and
  not has_table_privilege(current_user, 'model_price_revisions', 'INSERT') and
  not has_table_privilege(current_user, 'model_price_revisions', 'UPDATE') and
  not has_table_privilege(current_user, 'model_price_revisions', 'DELETE')
) as "modelPricing"`;

export const DICTIONARY_WORKER_DATABASE_PRIVILEGE_QUERY = `select
    ${tablePrivilegeExpression('dictionary_generation_jobs', ['SELECT', 'UPDATE'], 'and')} as "jobs",
    ${tablePrivilegeExpression('dictionary_generation_proposals', ['SELECT', 'INSERT', 'UPDATE'], 'and')} as "proposals",
    ${tablePrivilegeExpression('dictionary_generation_provider_circuit', ['SELECT', 'INSERT', 'UPDATE'], 'and')} as "providerCircuit",
    ${tablePrivilegeExpression('dictionary_document_uploads', ['SELECT', 'UPDATE'], 'and')} as "documentUploads",
    ${tablePrivilegeExpression('dictionary_document_object_versions', ['SELECT', 'INSERT', 'UPDATE'], 'and')} as "documentObjectVersions",
    ${tablePrivilegeExpression('dictionary_document_extractions', ['SELECT', 'INSERT', 'UPDATE'], 'and')} as "documentExtractions",
    has_table_privilege(current_user, 'public.dictionary_settings', 'SELECT') as "settings",
    has_table_privilege(current_user, 'public.dictionary_ai_configuration', 'SELECT') as "aiConfiguration",
    has_table_privilege(current_user, 'public.dictionary_ai_configuration_revisions', 'SELECT') as "aiConfigurationRevisions",
    ${tablePrivilegeExpression('dictionary_ai_worker_observations', ['SELECT', 'INSERT', 'UPDATE'], 'and')} as "aiWorkerObservations",
    (${columnPrivilegeExpression('ai_credit_accounts', ['user_id', 'mode', 'unlimited_until'], 'SELECT', 'and')}) as "aiCreditAccounts",
    (${columnPrivilegeExpression('ai_credit_grants', ['id', 'owner_id', 'amount', 'created_at', 'expires_at'], 'SELECT', 'and')}) as "aiCreditGrants",
    (${columnPrivilegeExpression('ai_credit_admin_removals', ['id', 'owner_id'], 'SELECT', 'and')}) as "aiCreditAdminRemovals",
    (${columnPrivilegeExpression('ai_credit_admin_removal_allocations', ['removal_id', 'grant_id', 'allocated_credits'], 'SELECT', 'and')}) as "aiCreditAdminRemovalAllocations",
    (${tablePrivilegeExpression('ai_credit_reservations', ['SELECT', 'INSERT'], 'and')}
        and ${['charged_credits', 'dispatched_at', 'measured_credits', 'measurement', 'settled_at', 'state'].map((column) => `has_column_privilege(current_user, 'public.ai_credit_reservations', '${column}', 'UPDATE')`).join(' and ')}) as "aiCreditReservations",
    (${tablePrivilegeExpression('ai_credit_reservation_allocations', ['SELECT', 'INSERT'], 'and')}
        and has_column_privilege(current_user, 'public.ai_credit_reservation_allocations', 'settled_credits', 'UPDATE')) as "aiCreditReservationAllocations",
    ${tablePrivilegeExpression('ai_credit_history', ['INSERT'], 'and')} as "aiCreditHistory",
    (has_column_privilege(current_user, 'public.dictionary_cards', 'id', 'SELECT')
        and has_column_privilege(current_user, 'public.dictionary_cards', 'dictionary_id', 'SELECT')
        and has_column_privilege(current_user, 'public.dictionary_cards', 'source', 'SELECT')
        and has_column_privilege(current_user, 'public.dictionary_cards', 'sort_key', 'SELECT')) as "dictionaryCardDuplicateColumns",
    ${tablePrivilegeExpression('dictionary_generation_jobs', ['INSERT', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'], 'or')} as "jobsUnexpected",
    ${tablePrivilegeExpression('dictionary_generation_proposals', ['DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'], 'or')} as "proposalsUnexpected",
    ${tablePrivilegeExpression('dictionary_generation_provider_circuit', ['DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'], 'or')} as "providerCircuitUnexpected",
    ${tablePrivilegeExpression('dictionary_document_uploads', ['INSERT', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'], 'or')} as "documentUploadsUnexpected",
    ${tablePrivilegeExpression('dictionary_document_object_versions', ['DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'], 'or')} as "documentObjectVersionsUnexpected",
    ${tablePrivilegeExpression('dictionary_document_extractions', ['DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'], 'or')} as "documentExtractionsUnexpected",
    ${tablePrivilegeExpression('dictionary_settings', ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'], 'or')} as "settingsUnexpected",
    ${tablePrivilegeExpression('dictionary_ai_configuration', ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'], 'or')} as "aiConfigurationUnexpected",
    ${tablePrivilegeExpression('dictionary_ai_configuration_revisions', ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'], 'or')} as "aiConfigurationRevisionsUnexpected",
    ${tablePrivilegeExpression('dictionary_ai_worker_observations', ['DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'], 'or')} as "aiWorkerObservationsUnexpected",
    (${tablePrivilegeExpression('ai_credit_accounts', ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'], 'or')} or ${unexpectedColumnPrivilegeExpression('ai_credit_accounts', ['user_id', 'mode', 'unlimited_until'], 'SELECT')}) as "aiCreditAccountsUnexpected",
    (${tablePrivilegeExpression('ai_credit_grants', ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'], 'or')} or ${unexpectedColumnPrivilegeExpression('ai_credit_grants', ['id', 'owner_id', 'amount', 'created_at', 'expires_at'], 'SELECT')}) as "aiCreditGrantsUnexpected",
    (${tablePrivilegeExpression('ai_credit_admin_removals', ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'], 'or')} or ${unexpectedColumnPrivilegeExpression('ai_credit_admin_removals', ['id', 'owner_id'], 'SELECT')}) as "aiCreditAdminRemovalsUnexpected",
    (${tablePrivilegeExpression('ai_credit_admin_removal_allocations', ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'], 'or')} or ${unexpectedColumnPrivilegeExpression('ai_credit_admin_removal_allocations', ['removal_id', 'grant_id', 'allocated_credits'], 'SELECT')}) as "aiCreditAdminRemovalAllocationsUnexpected",
    (${tablePrivilegeExpression('ai_credit_reservations', ['UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'], 'or')}
        or exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ai_credit_reservations' and column_name not in ('charged_credits', 'dispatched_at', 'measured_credits', 'measurement', 'settled_at', 'state') and has_column_privilege(current_user, 'public.ai_credit_reservations', column_name, 'UPDATE'))) as "aiCreditReservationsUnexpected",
    (${tablePrivilegeExpression('ai_credit_reservation_allocations', ['UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'], 'or')}
        or exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ai_credit_reservation_allocations' and column_name <> 'settled_credits' and has_column_privilege(current_user, 'public.ai_credit_reservation_allocations', column_name, 'UPDATE'))) as "aiCreditReservationAllocationsUnexpected",
    ${tablePrivilegeExpression('ai_credit_history', ['SELECT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'], 'or')} as "aiCreditHistoryUnexpected",
    ${tablePrivilegeExpression('dictionaries', forbiddenTablePrivileges, 'or')} as "dictionaries",
    ${tablePrivilegeExpression('dictionary_cards', forbiddenTablePrivileges, 'or')} as "dictionaryCards",
    exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'dictionary_cards'
          and (
        (column_name not in ('id', 'dictionary_id', 'source', 'sort_key', 'translation', 'example', 'example_translation', 'lifecycle', 'version', 'example_enabled_override', 'example_translation_enabled_override', 'example_language_role_override')
                  and has_column_privilege(current_user, 'public.dictionary_cards', column_name, 'SELECT'))
              or has_column_privilege(current_user, 'public.dictionary_cards', column_name, 'INSERT')
              or has_column_privilege(current_user, 'public.dictionary_cards', column_name, 'UPDATE')
              or has_column_privilege(current_user, 'public.dictionary_cards', column_name, 'REFERENCES')
          )
    ) as "dictionaryCardsUnexpectedColumns",
    ${tablePrivilegeExpression('dictionary_card_revisions', forbiddenTablePrivileges, 'or')} as "dictionaryCardRevisions",
    ${tablePrivilegeExpression('dictionary_idempotency_keys', forbiddenTablePrivileges, 'or')} as "dictionaryIdempotencyKeys",
    has_schema_privilege(current_user, 'public', 'CREATE') as "schemaCreate",
    ${tablePrivilegeExpression('users', forbiddenTablePrivileges, 'or')} as "users",
    ${tablePrivilegeExpression('user_emails', forbiddenTablePrivileges, 'or')} as "userEmails",
    ${tablePrivilegeExpression('password_credentials', forbiddenTablePrivileges, 'or')} as "passwordCredentials",
    ${tablePrivilegeExpression('auth_verification_challenges', forbiddenTablePrivileges, 'or')} as "authVerificationChallenges",
    ${tablePrivilegeExpression('auth_sessions', forbiddenTablePrivileges, 'or')} as "authSessions",
    ${tablePrivilegeExpression('auth_passkeys', forbiddenTablePrivileges, 'or')} as "authPasskeys",
    ${tablePrivilegeExpression('auth_security_events', forbiddenTablePrivileges, 'or')} as "authSecurityEvents",
    ${tablePrivilegeExpression('admin_memberships', forbiddenTablePrivileges, 'or')} as "adminMemberships",
    ${tablePrivilegeExpression('admin_audit_events', forbiddenTablePrivileges, 'or')} as "adminAuditEvents"`;
