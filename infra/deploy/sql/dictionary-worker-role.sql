\set ON_ERROR_STOP on

-- The role is provisioned separately with LOGIN and its secret. Apply this file
-- as the migration owner after every schema expansion:
-- psql "$MIGRATION_DATABASE_URL" --set=dictionary_worker_role=languon_dictionary_worker --file infra/deploy/sql/dictionary-worker-role.sql

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM :"dictionary_worker_role";
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM :"dictionary_worker_role";
REVOKE CREATE ON SCHEMA public FROM :"dictionary_worker_role";
GRANT USAGE ON SCHEMA public TO :"dictionary_worker_role";

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    dictionary_audio_assets, dictionary_audio_bindings, dictionary_audio_blobs, dictionary_audio_jobs
TO :"dictionary_worker_role";
GRANT SELECT (id, status) ON TABLE users TO :"dictionary_worker_role";
GRANT SELECT (id, owner_id, lifecycle, source_language_tag, target_language_tag) ON TABLE dictionaries TO :"dictionary_worker_role";

GRANT SELECT, UPDATE ON TABLE
    dictionary_generation_jobs
TO :"dictionary_worker_role";

GRANT SELECT, INSERT, UPDATE ON TABLE
    dictionary_generation_proposals,
    dictionary_generation_provider_circuit,
    dictionary_document_object_versions,
    dictionary_document_extractions
TO :"dictionary_worker_role";

GRANT SELECT, UPDATE ON TABLE
    dictionary_document_uploads
TO :"dictionary_worker_role";

GRANT SELECT ON TABLE
    dictionary_settings,
    dictionary_ai_configuration,
    dictionary_ai_configuration_revisions
TO :"dictionary_worker_role";

GRANT SELECT, INSERT, UPDATE ON TABLE
    dictionary_ai_worker_observations
TO :"dictionary_worker_role";

GRANT SELECT (user_id, mode, unlimited_until) ON TABLE
    ai_credit_accounts TO :"dictionary_worker_role";

GRANT SELECT (id, owner_id, amount, created_at, expires_at) ON TABLE
    ai_credit_grants TO :"dictionary_worker_role";

GRANT SELECT (id, owner_id) ON TABLE
    ai_credit_admin_removals TO :"dictionary_worker_role";

GRANT SELECT (removal_id, grant_id, allocated_credits) ON TABLE
    ai_credit_admin_removal_allocations TO :"dictionary_worker_role";

GRANT SELECT, INSERT ON TABLE
    ai_credit_reservations,
    ai_credit_reservation_allocations
TO :"dictionary_worker_role";

GRANT UPDATE (charged_credits, dispatched_at, measured_credits, measurement, settled_at, state) ON TABLE
    ai_credit_reservations
TO :"dictionary_worker_role";

GRANT UPDATE (settled_credits) ON TABLE
    ai_credit_reservation_allocations
TO :"dictionary_worker_role";

GRANT INSERT ON TABLE
    ai_credit_history
TO :"dictionary_worker_role";

GRANT SELECT (id, dictionary_id, source, sort_key, translation, example, example_translation, lifecycle, version, example_enabled_override, example_translation_enabled_override, example_language_role_override) ON TABLE
    dictionary_cards
TO :"dictionary_worker_role";

-- Learning runs in the same bounded worker process. Locks require UPDATE on
-- one harmless column; they do not authorize account or vocabulary mutations.
GRANT UPDATE (updated_at) ON TABLE users, dictionaries, dictionary_cards
TO :"dictionary_worker_role";
GRANT SELECT (id, lifecycle, owner_id, share_key_digest, share_key_version,
    share_locator, source_language_tag, target_language_tag, version, visibility)
ON TABLE dictionaries TO :"dictionary_worker_role";
GRANT SELECT (learning_version) ON TABLE dictionary_cards
TO :"dictionary_worker_role";
GRANT SELECT, UPDATE ON TABLE sentence_ai_jobs
TO :"dictionary_worker_role";
GRANT SELECT ON TABLE sentence_job_entries, sentence_manual_reviews
TO :"dictionary_worker_role";
GRANT SELECT, INSERT ON TABLE sentence_exercises, sentence_exercise_entries,
    sentence_attempts, sentence_exposures
TO :"dictionary_worker_role";
GRANT SELECT, INSERT, UPDATE ON TABLE sentence_entry_coverage
TO :"dictionary_worker_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE dictionary_generation_provider_usage_archive
TO :"dictionary_worker_role";
GRANT SELECT (version, custom_notation_label, definition_language_role,
    example_language_role, transcription_notation) ON TABLE dictionary_settings
TO :"dictionary_worker_role";

-- Durable preparation uses the existing admission and worker slots. The worker
-- reads visibility but cannot change personal/global archives or admin receipts.
GRANT SELECT ON TABLE sentence_personal_visibility, sentence_global_visibility
TO :"dictionary_worker_role";
GRANT SELECT, UPDATE ON TABLE sentence_preparations, sentence_preparation_batches
TO :"dictionary_worker_role";
GRANT SELECT, INSERT ON TABLE sentence_preparation_children
TO :"dictionary_worker_role";
GRANT INSERT ON TABLE sentence_ai_jobs, sentence_job_entries
TO :"dictionary_worker_role";
GRANT SELECT ON TABLE user_text_ai_preferences
TO :"dictionary_worker_role";

-- Row-lock permission for lifecycle fencing, without account/status/text writes.
GRANT UPDATE (updated_at) ON TABLE users TO :"dictionary_worker_role";
-- Preparation admission reserves credits; it cannot issue grants or change policy.
GRANT INSERT ON TABLE ai_credit_reservations TO :"dictionary_worker_role";

-- Expired inactive manifests are pruned under learner/preparation locks.
GRANT DELETE ON TABLE sentence_preparation_batches TO :"dictionary_worker_role";

-- Expiry pruning uses only identity and deadline, never confirmation content.
GRANT SELECT (id, expires_at), DELETE ON TABLE sentence_library_snapshots
TO :"dictionary_worker_role";
-- PostgreSQL requires UPDATE on one column for FOR UPDATE SKIP LOCKED.
GRANT UPDATE (expires_at) ON TABLE sentence_library_snapshots
TO :"dictionary_worker_role";

-- Shared speech: update durable execution/inventory, never publish tariffs or erase inventory.
GRANT SELECT ON TABLE speech_recordings, speech_jobs TO :"dictionary_worker_role";
GRANT UPDATE (state, storage, checksum, byte_length, duration_ms, version,
    last_accessed_at, deleted_at, text)
    ON TABLE speech_recordings TO :"dictionary_worker_role";
GRANT UPDATE (state, task_id, lease_token, lease_expires_at, next_poll_at,
    error, billing_state)
    ON TABLE speech_jobs TO :"dictionary_worker_role";
GRANT SELECT ON TABLE model_price_revisions TO :"dictionary_worker_role";
