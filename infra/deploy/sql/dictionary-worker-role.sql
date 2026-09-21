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
    dictionary_settings
TO :"dictionary_worker_role";

GRANT SELECT (id, dictionary_id, source, sort_key, translation, example, example_translation, lifecycle, version, example_enabled_override, example_translation_enabled_override, example_language_role_override) ON TABLE
    dictionary_cards
TO :"dictionary_worker_role";
