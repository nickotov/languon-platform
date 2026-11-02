\set ON_ERROR_STOP on
-- Provision a dedicated LOGIN secret separately, then apply as migration owner:
-- psql "$MIGRATION_DATABASE_URL" --set=account_purge_role=languon_account_purge --file infra/deploy/sql/account-purge-worker-role.sql
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM :"account_purge_role";
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM :"account_purge_role";
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM :"account_purge_role";
REVOKE CREATE ON SCHEMA public FROM :"account_purge_role";
GRANT USAGE ON SCHEMA public TO :"account_purge_role";
GRANT SELECT ON TABLE account_deletion_requests TO :"account_purge_role";
GRANT UPDATE (state, lease_worker_id, lease_deadline, fencing_token, attempt_count,
    updated_at, completed_at, next_attempt_at) ON TABLE account_deletion_requests TO :"account_purge_role";
GRANT SELECT (id, status, version) ON TABLE users TO :"account_purge_role";
GRANT SELECT, DELETE ON TABLE dictionary_generation_jobs, dictionary_document_uploads,
    dictionary_document_extractions, dictionary_document_object_versions,
    dictionary_generation_proposals, dictionary_card_revisions,
    dictionary_idempotency_keys, dictionaries TO :"account_purge_role";
GRANT DELETE ON TABLE auth_verification_challenges, auth_passkeys,
    password_credentials, auth_sessions, user_emails TO :"account_purge_role";
-- DELETE filters need only the opaque owner column, never email/hash/credential data.
GRANT SELECT (user_id) ON TABLE auth_verification_challenges, auth_passkeys,
    password_credentials, auth_sessions, user_emails TO :"account_purge_role";
GRANT DELETE ON TABLE user_text_ai_preferences TO :"account_purge_role";
GRANT SELECT (user_id) ON TABLE user_text_ai_preferences TO :"account_purge_role";
-- Purged accounts keep their user tombstone; erase personal navigation explicitly.
GRANT DELETE ON TABLE navigation_resources TO :"account_purge_role";
GRANT SELECT (owner_id) ON TABLE navigation_resources TO :"account_purge_role";
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

-- Preparation/library erasure reads opaque identities and manifests, never copied
-- vocabulary entries, translations, answers, or administrative snapshot content.
GRANT DELETE ON TABLE sentence_preparations, sentence_library_snapshots,
    sentence_library_receipts, sentence_preparation_batches
TO :"account_purge_role";
GRANT SELECT (id, learner_id, dictionary_id, active_job_id, current_action_id) ON TABLE
    sentence_preparations TO :"account_purge_role";
GRANT UPDATE (state, pause_reason, active_job_id, updated_at) ON TABLE
    sentence_preparations TO :"account_purge_role";
GRANT SELECT (id, preparation_id, manifest) ON TABLE
    sentence_preparation_batches TO :"account_purge_role";
GRANT UPDATE (manifest) ON TABLE sentence_preparation_batches
TO :"account_purge_role";
GRANT SELECT (actor_id, learner_id, dictionary_id, items) ON TABLE
    sentence_library_snapshots TO :"account_purge_role";
GRANT SELECT (actor_id, learner_id, dictionary_id) ON TABLE
    sentence_library_receipts TO :"account_purge_role";
-- Users are soft-purged, so personal visibility requires explicit erasure.
GRANT SELECT (learner_id) ON TABLE sentence_personal_visibility
TO :"account_purge_role";
GRANT DELETE ON TABLE sentence_personal_visibility TO :"account_purge_role";
GRANT SELECT (actor_id) ON TABLE sentence_personal_visibility,
    sentence_global_visibility TO :"account_purge_role";
GRANT UPDATE (actor_id) ON TABLE sentence_personal_visibility,
    sentence_global_visibility TO :"account_purge_role";

-- Retained successful speech is not account-owned data: no recording/text grants.
GRANT SELECT ON TABLE speech_jobs TO :"account_purge_role";
-- Text erasure requires only opaque ownership, lifecycle, and numerical accounting.
-- Never grant source/translation, revision snapshot, capability digest, job input,
-- result payload, or selection authority access to this worker.
GRANT DELETE ON TABLE texts_ai_jobs, dictionary_text_selection_jobs,
    text_idempotency, text_shares, text_revisions, texts, text_folders
    TO :"account_purge_role";
GRANT SELECT (owner_id) ON TABLE text_idempotency, text_shares,
    text_revisions, texts, text_folders TO :"account_purge_role";
GRANT SELECT (id, owner_id, execution_state, provider_reservation_state,
    ai_credit_reservation_id, lease_deadline, job_kind,
    provider_actual_cost_micros, provider_actual_input_tokens,
    provider_actual_output_tokens, provider_input_cost_micros_per_million_tokens,
    provider_output_cost_micros_per_million_tokens, provider_max_cost_micros_per_attempt,
    provider_max_input_tokens_per_attempt, provider_max_output_tokens_per_attempt,
    provider_reservation_settled_at)
    ON TABLE texts_ai_jobs, dictionary_text_selection_jobs TO :"account_purge_role";
GRANT SELECT (source_owner_id), UPDATE (source_owner_id)
    ON TABLE dictionary_text_selection_jobs TO :"account_purge_role";

-- Conversation cleanup uses opaque source ownership and numerical billing only.
-- Cascades erase messages, drafts, events and memory without granting body access.
GRANT SELECT (id, owner_id, source_kind, source_id), DELETE
    ON TABLE conversation_chats TO :"account_purge_role";
GRANT SELECT (id, conversation_id, owner_id, status, lease_until)
    ON TABLE conversation_turns TO :"account_purge_role";
GRANT SELECT, DELETE ON TABLE conversation_provider_calls TO :"account_purge_role";
GRANT SELECT (owner_id), DELETE ON TABLE conversation_settings TO :"account_purge_role";
GRANT SELECT (id, owner_id) ON TABLE knowledge_notes TO :"account_purge_role";
-- New private content erasure uses only its due, owner-scoped SECURITY DEFINER
-- entrypoint: no raw content reads or direct cross-owner deletion privileges.
GRANT SELECT (owner_id), DELETE ON TABLE knowledge_operation_receipts TO :"account_purge_role";
GRANT SELECT (id) ON TABLE texts TO :"account_purge_role";

-- Portrait erasure reads only opaque identities, lifecycle and pinned execution
-- pricing. It can overwrite private fields with tombstones without reading them.
GRANT SELECT (id, owner_id, interview_id, state, execution, cancel_requested, lease_until),
    UPDATE (state, cancel_requested, error_code, lease_until, lease_token,
        fingerprint, input, context, result), DELETE
    ON TABLE learner_portrait_interview_operations TO :"account_purge_role";
GRANT SELECT (id, owner_id, expires_at), DELETE
    ON TABLE learner_portrait_interviews TO :"account_purge_role";
GRANT SELECT (owner_id), DELETE ON TABLE learner_portraits TO :"account_purge_role";
-- This table contains numerical provider accounting only, with no prompt/body.
GRANT SELECT, DELETE ON TABLE learner_portrait_interview_provider_calls TO :"account_purge_role";
GRANT UPDATE (state, settled_at, actual_input_tokens, actual_output_tokens, actual_cost_micros)
    ON TABLE learner_portrait_interview_provider_calls TO :"account_purge_role";
GRANT SELECT ON TABLE ai_credit_reservation_allocations TO :"account_purge_role";
-- Financial removal is only available through a due, fenced deletion claim.
GRANT SELECT ON TABLE ai_credit_actions, ai_credit_action_allocations,
    ai_credit_action_attempts, ai_credit_grant_balances, ai_credit_wallet_totals
TO :"account_purge_role";
GRANT SELECT (user_id) ON TABLE ai_credit_accounts TO :"account_purge_role";
GRANT SELECT (id,owner_id) ON TABLE ai_credit_grants, ai_credit_admin_removals TO :"account_purge_role";
GRANT SELECT (id,owner_id,job_id,job_kind,state) ON TABLE ai_credit_reservations TO :"account_purge_role";
GRANT EXECUTE ON FUNCTION languon_assert_accounting_purge_claim(uuid,text,integer),
    languon_complete_account_purge(uuid,text,integer),
    languon_purge_ai_credit_owner(uuid,text,integer),
    languon_finalize_speech_accounting_for_purge(uuid,text,integer),
    languon_purge_private_knowledge_speech(uuid,text,integer),
    languon_purge_knowledge_owner(uuid,text,integer),
    languon_quiesce_knowledge_learning_for_purge(uuid,text,integer),
    languon_purge_admin_mcp_owner(uuid,text,integer,timestamptz),
    languon_recover_purge_interview_action(uuid,text,integer,uuid)
TO :"account_purge_role";
