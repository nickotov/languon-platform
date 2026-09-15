\set ON_ERROR_STOP on
-- Provision a dedicated LOGIN secret separately, then apply as migration owner:
-- psql "$MIGRATION_DATABASE_URL" --set=account_purge_role=languon_account_purge --file infra/deploy/sql/account-purge-worker-role.sql
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM :"account_purge_role";
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM :"account_purge_role";
REVOKE CREATE ON SCHEMA public FROM :"account_purge_role";
GRANT USAGE ON SCHEMA public TO :"account_purge_role";
GRANT SELECT, UPDATE ON TABLE account_deletion_requests TO :"account_purge_role";
GRANT SELECT (id, status, version), UPDATE (handle, status, updated_at, version)
    ON TABLE users TO :"account_purge_role";
GRANT SELECT, DELETE ON TABLE dictionary_generation_jobs, dictionary_document_uploads,
    dictionary_document_extractions, dictionary_document_object_versions,
    dictionary_generation_proposals, dictionary_card_revisions,
    dictionary_idempotency_keys, dictionaries TO :"account_purge_role";
GRANT DELETE ON TABLE auth_verification_challenges, auth_passkeys,
    password_credentials, auth_sessions, user_emails TO :"account_purge_role";
-- DELETE filters need only the opaque owner column, never email/hash/credential data.
GRANT SELECT (user_id) ON TABLE auth_verification_challenges, auth_passkeys,
    password_credentials, auth_sessions, user_emails TO :"account_purge_role";
GRANT SELECT (user_id), UPDATE (metadata) ON TABLE auth_security_events TO :"account_purge_role";
GRANT SELECT (actor_user_id, target_user_id), UPDATE (metadata, reason)
    ON TABLE admin_audit_events TO :"account_purge_role";
GRANT SELECT (user_id, granted_by_user_id, revoked_by_user_id, revoked_at),
    UPDATE (grant_reason, revoke_reason, updated_at)
    ON TABLE admin_memberships TO :"account_purge_role";
