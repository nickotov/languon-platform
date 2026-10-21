import { randomUUID } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    createDrizzleDatabase,
    grantDisposableMigrationPurpose,
    runPostgresMigrations,
} from '@languon/database';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { usersTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { DrizzleTextContentStore } from '../../../../src/modules/texts/infrastructure/persistence/drizzle/drizzle-text-content-store';
import { createTextsCryptography } from '../../../../src/modules/texts/infrastructure/texts-composition';
import {
    segmentText,
    validateTranslation,
} from '../../../../src/modules/texts/domain/text';
import {
    createTestPostgresClient,
    getMigrationsFolder,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

describe.runIf(isDatabaseIntegrationEnabled())(
    'Sidebar nullable text membership migration',
    () => {
        let client: ReturnType<typeof createTestPostgresClient>;
        beforeAll(() => {
            client = createTestPostgresClient();
        });

        afterAll(async () => client?.end());

        it('upgrades main 0079 folders, texts and jobs in place, then accepts independent rows', async () => {
            await resetTestDatabase(client);
            const migrationFolder = await mkdtemp(
                join(tmpdir(), 'languon-sidebar-membership-'),
            );
            try {
                await cp(getMigrationsFolder(), migrationFolder, {
                    recursive: true,
                });
                const journalPath = join(migrationFolder, 'meta/_journal.json');
                const journal = JSON.parse(
                    await readFile(journalPath, 'utf8'),
                ) as { entries: { idx: number }[] };
                journal.entries = journal.entries.filter(
                    (entry) => entry.idx < 80,
                );
                await writeFile(journalPath, JSON.stringify(journal));
                await runPostgresMigrations({
                    client,
                    migrationsFolder: migrationFolder,
                    purpose: grantDisposableMigrationPurpose(),
                });

                const ownerId = randomUUID();
                const folderId = randomUUID();
                const textId = randomUUID();
                const jobId = randomUUID();
                const revisionId = randomUUID();
                await client`insert into users(id,status) values(${ownerId},'active')`;
                await client`insert into text_folders(id,owner_id,name,created_at,updated_at) values(${folderId},${ownerId},'Existing',now(),now())`;
                await client`insert into texts(id,owner_id,folder_id,title,source_language,target_language,source_text,created_at,updated_at) values(${textId},${ownerId},${folderId},'Existing text','en','es','Existing source.',now(),now())`;
                await client`insert into dictionary_ai_configuration_revisions(id,version,created_by_user_id,catalog_snapshot) values(${revisionId},1,${ownerId},'{}'::jsonb)`;
                await client.begin(async (tx) => {
                    await tx`select set_config('languon.texts_execution_revision','1',true),set_config('languon.texts_capacity_revision','1',true),set_config('languon.text_ai_selection_revision','1',true),set_config('languon.ai_credit_settlement_revision','1',true)`;
                    await tx`insert into texts_ai_jobs(id,owner_id,folder_id,operation_id,request_fingerprint,job_kind,format,expires_at,selected_execution_snapshot,execution_revision_id,provider_max_cost_micros_per_attempt,provider_max_input_tokens_per_attempt,provider_max_output_tokens_per_attempt) values(${jobId},${ownerId},${folderId},${randomUUID()},'legacy','text-detection','text-detection:v1',now()+interval '1 hour','{}'::jsonb,${revisionId},1,8192,8192)`;
                });

                await migrateTestDatabase(client);
                await migrateTestDatabase(client);

                expect(
                    await client`select folder_id from texts where id=${textId}`,
                ).toEqual([{ folder_id: folderId }]);
                expect(
                    await client`select folder_id,format from texts_ai_jobs where id=${jobId}`,
                ).toEqual([
                    { folder_id: folderId, format: 'text-detection:v1' },
                ]);

                const independentTextId = randomUUID();
                await client`insert into texts(id,owner_id,folder_id,title,source_language,target_language,source_text,created_at,updated_at) values(${independentTextId},${ownerId},${null},'Independent','en','es','Independent source.',now(),now())`;
                const independentJobId = randomUUID();
                await client.begin(async (tx) => {
                    await tx`select set_config('languon.texts_execution_revision','1',true),set_config('languon.texts_capacity_revision','1',true),set_config('languon.text_ai_selection_revision','1',true),set_config('languon.ai_credit_settlement_revision','1',true)`;
                    await tx`insert into texts_ai_jobs(id,owner_id,folder_id,operation_id,request_fingerprint,job_kind,format,expires_at,selected_execution_snapshot,execution_revision_id,provider_max_cost_micros_per_attempt,provider_max_input_tokens_per_attempt,provider_max_output_tokens_per_attempt) values(${independentJobId},${ownerId},${null},${randomUUID()},'independent','text-detection','text-detection:v2',now()+interval '1 hour','{}'::jsonb,${revisionId},1,8192,8192)`;
                });
                expect(
                    await client`select folder_id,format from texts_ai_jobs where id=${independentJobId}`,
                ).toEqual([{ folder_id: null, format: 'text-detection:v2' }]);
            } finally {
                await rm(migrationFolder, { recursive: true, force: true });
            }
        }, 60_000);

        it('serializes share rotation against a confirmed move without exposing a stale capability', async () => {
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            const db = createDrizzleDatabase(client, databaseSchema);
            const now = new Date('2026-10-20T12:00:00.000Z');
            const store = new DrizzleTextContentStore(
                db,
                { generate: randomUUID },
                { now: () => now },
                createTextsCryptography(
                    'synthetic-text-content-secret-at-least-32-bytes',
                    { randomBytes },
                ),
                async (_tx, input) => {
                    const source = segmentText(
                        'Safe source.',
                        'en',
                        randomUUID,
                    );
                    return {
                        id: input.jobId,
                        sourceText: 'Safe source.',
                        sourceLanguage: 'en',
                        targetLanguage: 'es',
                        alignment: validateTranslation(
                            source,
                            source.map((segment) => ({
                                pairId: segment.pairId,
                                text: 'Fuente segura.',
                            })),
                        ),
                    };
                },
            );
            const ownerId = randomUUID();
            await db.insert(usersTable).values({
                id: ownerId,
                status: 'active',
                createdAt: now,
                updatedAt: now,
            });
            const source = await store.createFolder(ownerId, {
                name: 'Source',
                description: null,
            });
            const destination = await store.createFolder(ownerId, {
                name: 'Destination',
                description: null,
            });
            const draft = await store.createText(ownerId, {
                folderId: source.id,
                sourceLanguage: 'en',
                targetLanguage: 'es',
                sourceText: 'Safe source.',
            });
            const text = await store.saveText(ownerId, draft.id, {
                kind: 'proposal',
                expectedVersion: draft.version,
                jobId: randomUUID(),
            });
            const original = await store.issueShare(
                ownerId,
                'folder',
                destination.id,
                destination.version,
            );
            const listed = (
                await store.listFolders(ownerId, { limit: 10 })
            ).items.find((folder) => folder.id === destination.id)!;
            const [move, rotation] = await Promise.allSettled([
                store.moveText(ownerId, text.id, {
                    folderId: destination.id,
                    expectedVersion: text.version,
                    sharedFolderConfirmation: {
                        shareId: listed.shareId!,
                        shareVersion: listed.shareVersion!,
                    },
                }),
                store.issueShare(
                    ownerId,
                    'folder',
                    destination.id,
                    destination.version,
                ),
            ]);

            if (rotation.status !== 'fulfilled') throw rotation.reason;
            await expect(
                store.readShared(
                    {
                        kind: 'folder',
                        locator: original.locator,
                        key: original.key,
                    },
                    { limit: 10 },
                ),
            ).rejects.toMatchObject({ code: 'text_not_found' });
            const activeCapability = rotation.value;
            const visible = await store.readShared(
                {
                    kind: 'folder',
                    locator: activeCapability.locator,
                    key: activeCapability.key,
                },
                { limit: 10 },
            );
            if (move.status === 'fulfilled') {
                expect(visible.texts.map((item) => item.id)).toEqual([text.id]);
            } else {
                expect(move.reason).toMatchObject({
                    code: 'shared_folder_confirmation_required',
                });
                expect(visible.texts).toEqual([]);
            }
        }, 60_000);
    },
);
