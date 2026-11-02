\set ON_ERROR_STOP on

-- The role is provisioned separately with LOGIN and its secret. Apply this file
-- as the migration owner after every schema expansion:
-- psql "$MIGRATION_DATABASE_URL" --set=dictionary_worker_role=languon_dictionary_worker --file infra/deploy/sql/dictionary-worker-role.sql

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM :"dictionary_worker_role";
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM :"dictionary_worker_role";
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM :"dictionary_worker_role";
REVOKE CREATE ON SCHEMA public FROM :"dictionary_worker_role";
GRANT USAGE ON SCHEMA public TO :"dictionary_worker_role";

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    dictionary_audio_blobs
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

GRANT SELECT (user_id, mode, unlimited_until, management_version) ON TABLE
    ai_credit_accounts TO :"dictionary_worker_role";

GRANT SELECT (id, owner_id, amount, created_at, expires_at) ON TABLE
    ai_credit_grants TO :"dictionary_worker_role";

GRANT SELECT (id, owner_id) ON TABLE
    ai_credit_admin_removals TO :"dictionary_worker_role";

GRANT SELECT (removal_id, grant_id, allocated_credits) ON TABLE
    ai_credit_admin_removal_allocations TO :"dictionary_worker_role";

GRANT SELECT ON TABLE ai_credit_reservations, ai_credit_reservation_allocations
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
-- Base identifiers are needed only by existing UPDATE predicates/preparation joins.
-- Provider input comes from the dictionary-compatible view or a private lease DTO.
GRANT SELECT (id, execution_state, result_exercise_id) ON TABLE sentence_ai_jobs
TO :"dictionary_worker_role";
GRANT SELECT ON TABLE sentence_worker_jobs TO :"dictionary_worker_role";
GRANT UPDATE (execution_state, failure_category, result_exercise_id,
    result_attempt_id, attempt_count, fencing_token, worker_id, lease_deadline,
    heartbeat_at, cancellation_requested_at, next_attempt_at, completed_at,
    updated_at, ai_credit_reservation_id, ai_credit_policy_mode,
    ai_credit_provider_dispatched_at, provider_reservation_state,
    provider_reserved_attempts, provider_reserved_cost_micros,
    provider_reserved_input_tokens, provider_reserved_output_tokens,
    provider_reservation_settled_at, provider_actual_cost_micros,
    provider_actual_input_tokens, provider_actual_output_tokens)
ON TABLE sentence_ai_jobs TO :"dictionary_worker_role";
GRANT EXECUTE ON FUNCTION languon_sentence_worker_context(uuid),
    languon_claim_private_sentence_job(uuid,text,integer),
    languon_read_private_sentence_job(uuid,text,bigint,text),
    languon_recover_private_sentence_job(uuid),
    languon_sync_private_sentence_accounting(uuid)
TO :"dictionary_worker_role";
REVOKE ALL ON TABLE knowledge_sentence_exercises, knowledge_sentence_attempts,
    knowledge_sentence_exposures FROM :"dictionary_worker_role";
GRANT EXECUTE ON FUNCTION
    languon_publish_knowledge_sentence_generation(uuid,text,bigint,jsonb),
    languon_publish_knowledge_sentence_check(uuid,text,bigint,jsonb)
    TO :"dictionary_worker_role";
GRANT EXECUTE ON FUNCTION languon_knowledge_job_source_available(uuid,text,uuid) TO :"dictionary_worker_role";
REVOKE EXECUTE ON FUNCTION languon_publish_private_knowledge_translation(uuid,uuid,text,bigint,jsonb,timestamptz) FROM :"dictionary_worker_role";
GRANT EXECUTE ON FUNCTION languon_issue_private_translation_lease(uuid,text,bigint),
    languon_renew_private_translation_lease(uuid,text,bigint,uuid),
    languon_complete_private_knowledge_translation(uuid,uuid,text,bigint,uuid,jsonb),
    languon_cleanup_private_translation_results(integer)
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
GRANT SELECT ON TABLE sentence_preparations, sentence_preparation_batches,
    sentence_preparation_actions TO :"dictionary_worker_role";
GRANT UPDATE (state, pause_reason, active_job_id, updated_at) ON TABLE sentence_preparations
TO :"dictionary_worker_role";
GRANT UPDATE (manifest, scan_cursor, reviewed) ON TABLE sentence_preparation_batches
TO :"dictionary_worker_role";
GRANT UPDATE (terminal_outcome) ON TABLE sentence_preparation_actions TO :"dictionary_worker_role";
GRANT SELECT ON TABLE sentence_preparation_children
TO :"dictionary_worker_role";

GRANT SELECT ON TABLE user_text_ai_preferences
TO :"dictionary_worker_role";

-- Row-lock permission for lifecycle fencing, without account/status/text writes.
GRANT UPDATE (updated_at) ON TABLE users TO :"dictionary_worker_role";


-- Expired inactive manifests are pruned under learner/preparation locks.
GRANT DELETE ON TABLE sentence_preparation_batches TO :"dictionary_worker_role";

-- Expiry pruning uses only identity and deadline, never confirmation content.
GRANT SELECT (id, expires_at), DELETE ON TABLE sentence_library_snapshots
TO :"dictionary_worker_role";
-- PostgreSQL requires UPDATE on one column for FOR UPDATE SKIP LOCKED.
GRANT UPDATE (expires_at) ON TABLE sentence_library_snapshots
TO :"dictionary_worker_role";

-- Shared speech: update durable execution/inventory, never publish tariffs or erase inventory.
REVOKE UPDATE (provider_usage, provider_execution_facts) ON TABLE speech_jobs FROM :"dictionary_worker_role";
GRANT SELECT ON TABLE speech_recordings, speech_jobs TO :"dictionary_worker_role";
GRANT UPDATE (state, storage, checksum, byte_length, duration_ms, version,
    last_accessed_at, deleted_at, text)
    ON TABLE speech_recordings TO :"dictionary_worker_role";
GRANT UPDATE (state, task_id, lease_token, lease_expires_at, next_poll_at,
    error, billing_state)
    ON TABLE speech_jobs TO :"dictionary_worker_role";
GRANT SELECT ON TABLE model_price_revisions TO :"dictionary_worker_role";
-- Private knowledge speech validates source identity through a boolean lease fence, never document reads.
GRANT EXECUTE ON FUNCTION languon_speech_knowledge_source_state(uuid,uuid), languon_cleanup_knowledge_speech_quotes(integer) TO :"dictionary_worker_role";
REVOKE EXECUTE ON FUNCTION languon_knowledge_speech_binding_available(uuid), languon_erase_branch_speech(), languon_erase_proposal_speech() FROM :"dictionary_worker_role";
REVOKE UPDATE (source_binding_id) ON TABLE speech_jobs FROM :"dictionary_worker_role";


-- Texts jobs share the bounded worker and accounting infrastructure. Selection
-- publication is an explicit user-authorized operation, including new dictionary
-- creation; these rights never permit sharing, account mutation or deletion.
GRANT SELECT ON TABLE text_folders, texts, text_shares TO :"dictionary_worker_role";
GRANT UPDATE (updated_at) ON TABLE text_folders, texts TO :"dictionary_worker_role";
GRANT SELECT, UPDATE ON TABLE texts_ai_jobs, dictionary_text_selection_jobs TO :"dictionary_worker_role";
GRANT SELECT, INSERT ON TABLE dictionaries, dictionary_settings, dictionary_cards, dictionary_card_revisions TO :"dictionary_worker_role";
GRANT UPDATE (version, updated_at) ON TABLE dictionaries TO :"dictionary_worker_role";

-- PostgreSQL requires one UPDATE grant for a capability row lock.
GRANT UPDATE (created_at) ON TABLE text_shares TO :"dictionary_worker_role";

-- Conversation worker can persist private transcripts, drafts and thread memory.
-- Knowledge publication remains an explicit authenticated application action.
GRANT SELECT, UPDATE ON TABLE conversation_chats, conversation_turns
    TO :"dictionary_worker_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE conversation_messages,
    conversation_events, conversation_drafts, conversation_memory,
    conversation_provider_calls TO :"dictionary_worker_role";
GRANT USAGE, SELECT ON SEQUENCE conversation_events_id_seq TO :"dictionary_worker_role";
GRANT SELECT ON TABLE knowledge_notes, knowledge_note_revisions TO :"dictionary_worker_role";
REVOKE SELECT ON TABLE knowledge_working_branches FROM :"dictionary_worker_role";
GRANT SELECT (id, note_id, version) ON TABLE knowledge_working_branches TO :"dictionary_worker_role";
GRANT UPDATE (updated_at) ON TABLE knowledge_working_branches TO :"dictionary_worker_role";
-- Private narration provenance is created only by authenticated admission.
REVOKE SELECT, INSERT ON TABLE knowledge_speech_recordings FROM :"dictionary_worker_role";
REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE conversation_block_proposals FROM :"dictionary_worker_role";
GRANT EXECUTE ON FUNCTION public.languon_propose_learning_blocks(uuid,uuid,jsonb) TO :"dictionary_worker_role";
GRANT EXECUTE ON FUNCTION public.languon_propose_learning_block_change(uuid,uuid,jsonb,uuid) TO :"dictionary_worker_role";
-- Transcription reads immutable admitted jobs and changes lifecycle only. Audio
-- bytes require the exact live job lease; financial receipts use typed authority.
-- Config revisions contain a private credential equality pin; only definer authority reads them.
REVOKE SELECT ON TABLE knowledge_transcription_config_revisions,
    knowledge_transcription_state FROM :"dictionary_worker_role";
-- Finished transcripts are private author content, never queue metadata.
GRANT SELECT (id, owner_id, note_id, asset_id, languages, state, worker_id,
    fencing_token, lease_deadline, deadline_at, cancellation_requested_at,
    source_duration_ms, byte_length, created_at)
    ON TABLE knowledge_transcription_jobs TO :"dictionary_worker_role";
REVOKE UPDATE ON TABLE knowledge_transcription_jobs FROM :"dictionary_worker_role";
REVOKE UPDATE (state, worker_id, fencing_token, lease_deadline,
    cancellation_requested_at, receipt_id, attempt_id, dispatched_at,
    observed_audio_input_ms, result, failure_code, updated_at)
    ON TABLE knowledge_transcription_jobs FROM :"dictionary_worker_role";
REVOKE EXECUTE ON FUNCTION languon_authorize_transcription_dispatch(uuid,text,integer,text,integer,integer),
    languon_observe_transcription_call(uuid,uuid,bigint),
    languon_settle_transcription_attempt(uuid,boolean),
    languon_read_transcription_audio(uuid,text,integer) FROM :"dictionary_worker_role";
REVOKE EXECUTE ON FUNCTION languon_authorize_transcription_dispatch_fenced(uuid,text,integer,uuid,text,integer,integer) FROM :"dictionary_worker_role";

GRANT EXECUTE ON FUNCTION
    languon_authorize_transcription_dispatch_fenced(uuid,text,integer,uuid,text,integer,integer,text),
    languon_claim_transcription(uuid,text),
    languon_heartbeat_transcription(uuid,text,integer,uuid),
    languon_finish_transcription(uuid,text,integer,uuid,jsonb,text),
    languon_recover_transcription(uuid),
    languon_read_transcription_audio_fenced(uuid,text,integer,uuid)
    TO :"dictionary_worker_role";
GRANT UPDATE (updated_at) ON TABLE knowledge_notes TO :"dictionary_worker_role";
GRANT SELECT ON TABLE dictionary_cards TO :"dictionary_worker_role";

GRANT SELECT ON TABLE conversation_settings TO :"dictionary_worker_role";

-- Action accounting reads immutable policy/prices and compact projections.
-- Customer grants, policy publication and manual payment entry remain denied.
GRANT SELECT ON TABLE ai_credit_grant_balances, ai_credit_wallet_totals,
    ai_capability_policy_revisions, ai_accounting_settings_revisions,
    ai_provider_price_revisions,
    text_ai_capacity_jobs, text_ai_capacity_queue_totals,
    text_ai_capacity_provider_usage, text_ai_capacity_active_totals,
    text_ai_capacity_settled_buckets TO :"dictionary_worker_role";
GRANT SELECT ON TABLE ai_action_charging_policies,
    ai_credit_actions, ai_credit_action_allocations, ai_credit_action_attempts,
    ai_provider_expense_records, ai_operator_action_budgets,
    ai_operator_attempt_costs, ai_operator_daily_budgets
TO :"dictionary_worker_role";
-- Immutable-column locking grants allow fenced reads, never financial mutations.
GRANT UPDATE (id) ON TABLE ai_credit_actions, ai_credit_action_attempts
    TO :"dictionary_worker_role";
GRANT UPDATE (grant_id) ON TABLE ai_credit_grant_balances TO :"dictionary_worker_role";
GRANT UPDATE (action_id) ON TABLE ai_operator_action_budgets TO :"dictionary_worker_role";
GRANT EXECUTE ON FUNCTION languon_admit_text_provider_attempt(uuid,uuid,text,integer,integer,uuid,text,text,bigint,timestamptz),
    languon_settle_credit_action(uuid,text,timestamptz),
    languon_settle_text_provider_attempt(uuid,boolean,integer,integer,integer,integer,timestamptz),
    languon_settle_text_provider_attempt(uuid,boolean,integer,integer,integer,integer,timestamptz,jsonb),
    languon_authorize_native_text_call(uuid,integer,integer),
    languon_observe_native_text_call(uuid,jsonb),
    languon_retain_speech_provider_observation(uuid,uuid,jsonb,jsonb),
    languon_record_text_provider_expense(uuid,jsonb),
    languon_admit_speech_provider_attempt(uuid,uuid),
    languon_record_speech_provider_expense(uuid,text),
    languon_settle_speech_customer(uuid,text),
    languon_admit_sentence_preparation_child(uuid,uuid,bigint,timestamptz),
    languon_cleanup_speech_admission_counters(integer)
TO :"dictionary_worker_role";

-- Checked speech dispatch owns the immutable provider timestamp and operator attempt.
GRANT SELECT ON TABLE speech_daily_admission_counters TO :"dictionary_worker_role";

-- Routing admissions and exact per-call receipts are immutable worker reads.
-- Activation, probes and emergency disable stay with authenticated admin code.
GRANT SELECT ON TABLE text_ai_routing_state, text_ai_routing_revisions,
    text_ai_probes, text_ai_route_dispatches TO :"dictionary_worker_role";
GRANT EXECUTE ON FUNCTION languon_text_ai_route_dispatch_allowed(text,text,text,timestamptz),
    languon_record_text_ai_route_health(uuid,uuid,uuid,text,text,bigint,text)
    TO :"dictionary_worker_role";

-- Knowledge block authoring sources expose identities only. Private learner
-- attempts remain inaccessible; evaluation publication requires a live exact job fence.
GRANT SELECT ON TABLE knowledge_field_job_sources TO :"dictionary_worker_role";
GRANT EXECUTE ON FUNCTION
    languon_assert_knowledge_field_action_source(uuid,uuid),
    languon_assert_knowledge_exercise_action_source(uuid,uuid),
    languon_publish_knowledge_exercise_evaluation(uuid,text,bigint,jsonb)
    TO :"dictionary_worker_role";
