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
    dictionary_audio_assets, dictionary_audio_bindings, dictionary_audio_blobs, dictionary_audio_jobs,
    dictionary_document_extractions, dictionary_document_object_versions,
    dictionary_generation_proposals, dictionary_card_revisions,
    dictionary_idempotency_keys, dictionaries,
    ai_credit_accounts, ai_credit_admin_removals, ai_credit_grants,
    ai_credit_history, ai_credit_reservations TO :"account_purge_role";
GRANT DELETE ON TABLE auth_verification_challenges, auth_passkeys,
    password_credentials, auth_sessions, user_emails TO :"account_purge_role";
-- DELETE filters need only the opaque owner column, never email/hash/credential data.
GRANT SELECT (user_id) ON TABLE auth_verification_challenges, auth_passkeys,
    password_credentials, auth_sessions, user_emails TO :"account_purge_role";
GRANT DELETE ON TABLE user_text_ai_preferences TO :"account_purge_role";
GRANT SELECT (user_id) ON TABLE user_text_ai_preferences TO :"account_purge_role";
-- Learner cleanup includes records on dictionaries owned by another user.
GRANT DELETE ON TABLE flashcard_entry_progress, flashcard_attempts,
    flashcard_preferences TO :"account_purge_role";
GRANT SELECT (learner_id) ON TABLE flashcard_entry_progress, flashcard_attempts,
    flashcard_preferences TO :"account_purge_role";
GRANT DELETE ON TABLE dictionary_deletion_receipts,
    dictionary_generation_provider_usage_archive TO :"account_purge_role";
GRANT SELECT (owner_id) ON TABLE dictionary_deletion_receipts,
    dictionary_generation_provider_usage_archive TO :"account_purge_role";
GRANT INSERT (id, owner_id, actual_cost_micros, actual_input_tokens,
    actual_output_tokens, input_cost_micros_per_million_tokens,
    output_cost_micros_per_million_tokens, max_cost_micros_per_attempt,
    max_input_tokens_per_attempt, max_output_tokens_per_attempt,
    settled_at, archived_at, job_kind)
    ON TABLE dictionary_generation_provider_usage_archive TO :"account_purge_role";
GRANT SELECT (id) ON TABLE dictionary_generation_provider_usage_archive TO :"account_purge_role";
-- Permanent sentence cleanup uses identity and numerical accounting only.
GRANT DELETE ON TABLE sentence_ai_jobs, sentence_exercises, sentence_attempts,
    sentence_manual_reviews, sentence_exposures, sentence_entry_coverage,
    sentence_next_receipts TO :"account_purge_role";
GRANT SELECT (id, learner_id, dictionary_id, execution_state,
    provider_reservation_state, job_kind, provider_actual_cost_micros,
    provider_actual_input_tokens, provider_actual_output_tokens,
    provider_input_cost_micros_per_million_tokens,
    provider_output_cost_micros_per_million_tokens,
    provider_max_cost_micros_per_attempt, provider_max_input_tokens_per_attempt,
    provider_max_output_tokens_per_attempt, provider_reservation_settled_at)
    ON TABLE sentence_ai_jobs TO :"account_purge_role";
GRANT SELECT (id, creator_id, dictionary_id) ON TABLE sentence_exercises TO :"account_purge_role";
GRANT SELECT (id, learner_id, dictionary_id, exercise_id, operation_id, request_fingerprint)
    ON TABLE sentence_manual_reviews TO :"account_purge_role";
GRANT SELECT (learner_id) ON TABLE sentence_attempts, sentence_exposures TO :"account_purge_role";
GRANT SELECT (learner_id, dictionary_id) ON TABLE sentence_entry_coverage,
    sentence_next_receipts TO :"account_purge_role";
GRANT SELECT (user_id), UPDATE (metadata) ON TABLE auth_security_events TO :"account_purge_role";
GRANT SELECT (actor_user_id, target_user_id), UPDATE (metadata, reason)
    ON TABLE admin_audit_events TO :"account_purge_role";
GRANT SELECT (user_id, granted_by_user_id, revoked_by_user_id, revoked_at),
    UPDATE (grant_reason, revoke_reason, updated_at)
    ON TABLE admin_memberships TO :"account_purge_role";
