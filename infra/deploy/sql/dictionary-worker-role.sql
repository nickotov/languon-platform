\set ON_ERROR_STOP on

-- The role is provisioned separately with LOGIN and its secret. Apply this file
-- as the migration owner after every schema expansion:
-- psql "$MIGRATION_DATABASE_URL" --set=dictionary_worker_role=languon_dictionary_worker --file infra/deploy/sql/dictionary-worker-role.sql

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM :"dictionary_worker_role";
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM :"dictionary_worker_role";
REVOKE CREATE ON SCHEMA public FROM :"dictionary_worker_role";
GRANT USAGE ON SCHEMA public TO :"dictionary_worker_role";

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

GRANT SELECT (id, dictionary_id, source, sort_key) ON TABLE
    dictionary_cards
TO :"dictionary_worker_role";
