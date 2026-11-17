import { randomUUID } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
    grantDisposableMigrationPurpose,
    runPostgresMigrations,
} from '@languon/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
    createTestPostgresClient,
    getMigrationsFolder,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

describe.runIf(isDatabaseIntegrationEnabled())(
    'conversation content proposal migration',
    () => {
        let client: ReturnType<typeof createTestPostgresClient>;

        beforeAll(() => {
            client = createTestPostgresClient();
        });

        afterAll(async () => client?.end());

        it('preserves a legacy proposal identity, target, application receipt and ordered blocks when it becomes mixed content', async () => {
            await resetTestDatabase(client);
            const folder = await mkdtemp(
                join(tmpdir(), 'languon-content-proposal-migration-'),
            );

            try {
                await cp(getMigrationsFolder(), folder, { recursive: true });
                const journalPath = join(folder, 'meta', '_journal.json');
                const journal = JSON.parse(
                    await readFile(journalPath, 'utf8'),
                ) as {
                    entries: { idx: number }[];
                };

                // Seed an actual 0171 schema row, then let the checked-in 0172+
                // migrations perform the table rename and body conversion.
                journal.entries = journal.entries.filter(
                    (entry) => entry.idx < 172,
                );

                await writeFile(journalPath, JSON.stringify(journal));
                await runPostgresMigrations({
                    client,
                    migrationsFolder: folder,
                    purpose: grantDisposableMigrationPurpose(),
                });

                const ownerId = randomUUID();
                const noteId = randomUUID();
                const branchId = randomUUID();
                const conversationId = randomUUID();

                const turnId = randomUUID();
                const proposalId = randomUUID();
                const targetBlockId = randomUUID();
                const dependencyBlockId = randomUUID();
                const createdAt = '2026-01-02T03:04:05.000Z';
                const appliedAt = '2026-01-02T03:05:06.000Z';
                const target = {
                    id: targetBlockId,
                    type: 'grammar',
                    language: 'fr',
                    rule: 'Le complément direct répond à qui ou quoi.',
                };
                const dependency = {
                    id: dependencyBlockId,
                    type: 'vocabulary',
                    language: 'fr',
                    translationLanguage: 'ru',
                    entries: [
                        {
                            id: randomUUID(),
                            term: 'citoyen',
                            translation: 'гражданин',
                        },
                    ],
                };
                const legacyBlocks = [target, dependency];
                const targetSnapshot = {
                    type: 'learningBlock',
                    attrs: { block: target },
                };
                const dependencies = [
                    {
                        sourceRef: `block:${dependencyBlockId}`,
                        block: dependency,
                    },
                ];
                const branchContent = {
                    schemaVersion: 2,
                    body: {
                        document: { type: 'doc', content: [targetSnapshot] },
                    },
                };

                await client.begin(async (tx) => {
                    // Match normal conversation admission: the trigger requires
                    // the shared capacity fence and transaction-local markers.
                    await tx`with capacity_fence as materialized (select pg_advisory_xact_lock(4312189072)) select set_config('languon.text_ai_capacity_revision', '1', true), set_config('languon.texts_capacity_revision', '1', true), set_config('languon.conversation_capacity_revision', '1', true) from capacity_fence`;
                    await tx`insert into users(id,status) values (${ownerId},'active')`;
                    await tx`insert into knowledge_notes(id,owner_id,title,summary,body,categories,plain_text,created_at,updated_at) values (${noteId},${ownerId},'Legacy proposal note','',${JSON.stringify(branchContent)}::jsonb,'{}','',${createdAt},${createdAt})`;
                    await tx`insert into knowledge_working_branches(id,note_id,version,base_published_version,content,updated_at) values (${branchId},${noteId},8,7,${JSON.stringify(branchContent)}::jsonb,${createdAt})`;
                    await tx`insert into conversation_chats(id,owner_id,source_kind,source_id,source,preferences,created_at,updated_at) values (${conversationId},${ownerId},'knowledge',${noteId},'{"view":"draft"}'::jsonb,'{}'::jsonb,${createdAt},${createdAt})`;
                    await tx`insert into conversation_turns(id,conversation_id,owner_id,request_id,request_fingerprint,status,authority,source_snapshot,preferences,execution,usage,created_at,updated_at) values (${turnId},${conversationId},${ownerId},${randomUUID()},'legacy-content-proposal','succeeded','{}'::jsonb,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb,${createdAt},${createdAt})`;
                    await tx`insert into conversation_block_proposals(id,conversation_id,turn_id,note_id,branch_id,base_branch_version,blocks,target_block_id,target_snapshot,dependency_snapshots,created_at,applied_at,applied_branch_version) values (${proposalId},${conversationId},${turnId},${noteId},${branchId},7,${JSON.stringify(legacyBlocks)}::jsonb,${targetBlockId},${JSON.stringify(targetSnapshot)}::jsonb,${JSON.stringify(dependencies)}::jsonb,${createdAt},${appliedAt},8)`;
                });

                await migrateTestDatabase(client);
                await migrateTestDatabase(client);

                const [proposal] = await client<
                    {
                        id: string;
                        conversation_id: string;
                        turn_id: string;
                        note_id: string;
                        branch_id: string;
                        base_branch_version: number;
                        target_block_id: string | null;
                        target_snapshot: unknown;
                        dependency_snapshots: unknown;
                        created_at: string;
                        applied_at: string | null;
                        applied_branch_version: number | null;
                        body: unknown;
                    }[]
                >`select id, conversation_id, turn_id, note_id, branch_id, base_branch_version, target_block_id, target_snapshot, dependency_snapshots, to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at, to_char(applied_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as applied_at, applied_branch_version, body from conversation_content_proposals where id=${proposalId}`;

                expect(proposal).toMatchObject({
                    id: proposalId,
                    conversation_id: conversationId,
                    turn_id: turnId,
                    note_id: noteId,
                    branch_id: branchId,
                    base_branch_version: 7,
                    target_block_id: targetBlockId,
                    target_snapshot: targetSnapshot,
                    dependency_snapshots: dependencies,
                    applied_branch_version: 8,
                });

                expect(proposal?.created_at).toBe(createdAt);

                expect(proposal?.applied_at).toBe(appliedAt);

                expect(proposal?.body).toEqual({
                    schemaVersion: 2,
                    document: {
                        type: 'doc',
                        content: legacyBlocks.map((block) => ({
                            type: 'learningBlock',
                            attrs: { block },
                        })),
                    },
                });
            } finally {
                await rm(folder, { recursive: true, force: true });
            }
        }, 60_000);
    },
);
