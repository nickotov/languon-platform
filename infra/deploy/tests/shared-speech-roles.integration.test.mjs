import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    SHARED_SPEECH_WORKER_DATABASE_PRIVILEGE_QUERY,
    MODEL_PRICING_WORKER_DATABASE_PRIVILEGE_QUERY,
} from '../lib/deployment.mjs';

function execute(binary, args, options, input) {
    return new Promise((resolve, reject) => {
        const child = execFile(
            binary,
            args,
            options,
            (error, stdout, stderr) => {
                if (error)
                    reject(
                        new Error(
                            `PostgreSQL role verification failed: ${stderr}`,
                            { cause: error },
                        ),
                    );
                else resolve({ stdout });
            },
        );
        child.stdin.end(input);
    });
}
const databaseUrl = process.env.SPEECH_DEPLOY_ROLE_TEST_DATABASE_URL;

// Explicit opt-in against the isolated, migrated authentication/speech test DB.
// The transaction rolls back role creation, membership, grants and fixture writes.
test(
    'production speech roles apply to the real schema and enforce retained-content boundaries',
    {
        skip: !databaseUrl,
    },
    async () => {
        const target = new URL(databaseUrl);
        assert.ok(['postgres:', 'postgresql:'].includes(target.protocol));
        assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname));
        assert.equal(target.port, '55432');
        assert.equal(target.pathname, '/languon_auth_speech_test');
        const readyId = randomUUID();
        const deletingId = randomUUID();
        const suffix = `${process.pid}_${Date.now()}`;
        const workerRole = `speech_role_worker_${suffix}`;
        const purgeRole = `speech_role_purge_${suffix}`;
        const grants = async (path, variable, role) =>
            (await readFile(path, 'utf8'))
                .replace(/^\\.*$/gm, '')
                .replaceAll(`:"${variable}"`, `"${role}"`);
        const worker = await grants(
            'infra/deploy/sql/dictionary-worker-role.sql',
            'dictionary_worker_role',
            workerRole,
        );
        const purge = await grants(
            'infra/deploy/sql/account-purge-worker-role.sql',
            'account_purge_role',
            purgeRole,
        );
        const sql = `
BEGIN;
CREATE ROLE "${workerRole}" NOLOGIN;
CREATE ROLE "${purgeRole}" NOLOGIN;
${worker}
${purge}
INSERT INTO speech_recordings (id, canonical_key, text, language, normalization_revision, profile, state, storage, created_at, last_accessed_at, ready_at)
VALUES
 ('${readyId}', 'role-verify-ready-${suffix}', 'fixture retained text', 'en', 'role-test-v1', '{}', 'ready', '{"backend":"postgres","namespace":"role-test","key":"speech/role-ready-${suffix}"}', clock_timestamp(), clock_timestamp(), clock_timestamp()),
 ('${deletingId}', 'role-verify-deleting-${suffix}', 'fixture approved deletion', 'en', 'role-test-v1', '{}', 'deleting', '{"backend":"postgres","namespace":"role-test","key":"speech/role-deleting-${suffix}"}', clock_timestamp(), clock_timestamp(), NULL);
SET ROLE "${workerRole}";
SET LOCAL languon.speech_worker_version = '1';
SET LOCAL languon.model_pricing_revision = '1';
DO $speech_role_guard$
BEGIN
 BEGIN
  UPDATE speech_recordings SET state='deleted' WHERE id='${readyId}';
  RAISE EXCEPTION 'Worker retained deletion was not blocked';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 BEGIN
  UPDATE speech_recordings SET state='deleting' WHERE id='${readyId}';
  RAISE EXCEPTION 'Worker administrative deletion was not blocked';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 BEGIN
  UPDATE speech_recordings SET text='' WHERE id='${readyId}';
  RAISE EXCEPTION 'Worker retained text erasure was not blocked';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 BEGIN
  UPDATE speech_recordings SET storage=jsonb_set(storage,'{key}','"changed"') WHERE id='${readyId}';
  RAISE EXCEPTION 'Worker storage identity mutation was not blocked';
 EXCEPTION WHEN SQLSTATE '23514' THEN NULL; END;
 BEGIN
  UPDATE speech_recordings SET canonical_key='changed' WHERE id='${readyId}';
  RAISE EXCEPTION 'Worker immutable column mutation was not blocked';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END $speech_role_guard$;
-- Root-owner fixture represents already approved deletion; only this cleanup succeeds.
UPDATE speech_recordings SET state='deleted', text='' WHERE id='${deletingId}';
SELECT json_build_object('readyDeletionGuarded', true, 'readyScrubGuarded', true,
 'storageIdentityGuarded', true, 'immutableColumnsGuarded', true,
 'approvedDeletionCleanupAllowed', EXISTS(SELECT 1 FROM speech_recordings WHERE id='${deletingId}' AND state='deleted' AND text=''))::text;
SELECT row_to_json(result)::text FROM (${SHARED_SPEECH_WORKER_DATABASE_PRIVILEGE_QUERY}) result;
SELECT row_to_json(result)::text FROM (${MODEL_PRICING_WORKER_DATABASE_PRIVILEGE_QUERY}) result;
SELECT json_build_object(
 'workerCannotReadQuoteText', NOT has_column_privilege(current_user, 'speech_quotes', 'source', 'SELECT'),
 'workerCannotEraseJobs', NOT has_table_privilege(current_user, 'speech_jobs', 'DELETE'),
 'workerCannotChangeCanonical', NOT has_column_privilege(current_user, 'speech_recordings', 'canonical_key', 'UPDATE'),
 'workerCannotChangeLanguage', NOT has_column_privilege(current_user, 'speech_recordings', 'language', 'UPDATE'),
 'workerCannotChangeProfile', NOT has_column_privilege(current_user, 'speech_recordings', 'profile', 'UPDATE'),
 'workerCannotChangeJobPayer', NOT has_column_privilege(current_user, 'speech_jobs', 'payer_id', 'UPDATE'),
 'workerCannotChangeRate', NOT has_column_privilege(current_user, 'speech_jobs', 'rate_revision_id', 'UPDATE'),
 'workerCannotChangeDeadline', NOT has_column_privilege(current_user, 'speech_jobs', 'billing_deadline', 'UPDATE'),
 'workerCanExecuteInventoryQuery', (SELECT count(*) >= 0 FROM speech_recordings),
 'workerCanExecuteJobQuery', (SELECT count(*) >= 0 FROM speech_jobs)
)::text;
RESET ROLE;
SET ROLE "${purgeRole}";
SELECT json_build_object(
 'purgeCannotReadRetainedText', NOT has_column_privilege(current_user, 'speech_recordings', 'text', 'SELECT'),
 'purgeCannotEraseRecordings', NOT has_table_privilege(current_user, 'speech_recordings', 'DELETE'),
 'purgeCannotWritePrices', NOT has_table_privilege(current_user, 'model_price_revisions', 'INSERT'),
 'purgeCanReadJobQuery', (SELECT count(*) >= 0 FROM speech_jobs),
 'purgeCanDetachPayer', has_column_privilege(current_user, 'speech_jobs', 'payer_id', 'UPDATE'),
 'purgeCannotChangeTask', NOT has_column_privilege(current_user, 'speech_jobs', 'task_id', 'UPDATE'),
 'purgeCanReleaseHold', has_column_privilege(current_user, 'ai_credit_reservations', 'state', 'UPDATE'),
 'purgeCanWriteReleaseHistory', has_column_privilege(current_user, 'ai_credit_history', 'amount', 'INSERT'),
 'purgeCanDeleteBindings', has_table_privilege(current_user, 'speech_bindings', 'DELETE'),
 'purgeCanDeleteQuotes', has_table_privilege(current_user, 'speech_quotes', 'DELETE')
)::text;
-- Execute column-scoped operations, not just catalog privilege introspection.
UPDATE speech_jobs SET payer_id = NULL, reservation_id = NULL, billing_state = billing_state WHERE FALSE;
DELETE FROM speech_bindings WHERE actor_id IS NULL;
DELETE FROM speech_quotes WHERE actor_id IS NULL;
UPDATE ai_credit_reservations SET state = state, settled_at = settled_at WHERE FALSE;
RESET ROLE;
ROLLBACK;
`;
        const { stdout } = await execute(
            process.env.PSQL_BINARY ?? 'psql',
            [
                '--no-psqlrc',
                '--quiet',
                '--no-align',
                '--tuples-only',
                '--set',
                'ON_ERROR_STOP=1',
                '--host',
                target.hostname,
                '--port',
                target.port,
                '--username',
                decodeURIComponent(target.username),
                '--dbname',
                target.pathname.slice(1),
            ],
            {
                env: {
                    ...process.env,
                    PGPASSWORD: decodeURIComponent(target.password),
                },
                maxBuffer: 1_000_000,
                timeout: 30_000,
            },
            sql,
        );
        const rows = stdout
            .trim()
            .split('\n')
            .filter((line) => line.startsWith('{'))
            .map((line) => JSON.parse(line));
        assert.equal(rows.length, 5);
        for (const row of rows)
            for (const [capability, supported] of Object.entries(row))
                assert.equal(supported, true, capability);
    },
);
