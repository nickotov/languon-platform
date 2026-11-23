import { createSpeechInfrastructure } from '../../../../src/modules/speech/infrastructure/composition';
import { startAccountingMaintenance } from '../../../../src/infrastructure/text-ai/accounting-maintenance';
import { loadDictionaryAudioEnvironment } from '../../../../src/modules/speech/infrastructure/audio/dictionary-audio-environment';
import { FixtureSpeechProvider } from '../../../../src/modules/speech/infrastructure/audio/speech-providers';
import { PostgresAudioObjectStorage } from '../../../../src/modules/speech/infrastructure/audio/audio-object-storages';
import { DrizzleProviderPriceStore } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-provider-prices';
import { capabilityPolicyRevisionsTable } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/capability-policy-schema';
import { adminMembershipsTable } from '../../../../src/modules/administration/infrastructure/persistence/drizzle/schema';
import { reserveConversationActionFixture } from '../../support/accounting-action-fixture';
import { randomUUID } from 'node:crypto';
import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import {
    createListeningQueueProcessor,
    ListeningSpeechPending,
} from '../../../../src/modules/speech/infrastructure/listening-recording-queue';
import type { ListeningSpeechInput } from '../../../../src/modules/speech/infrastructure/audio/prepare-listening-recording';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

describe.runIf(isDatabaseIntegrationEnabled())(
    'listening preparation handoff',
    () => {
        let client: PostgresClient;
        beforeAll(async () => {
            client = createTestPostgresClient();
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
        }, 120000);

        afterAll(() => client?.end());
        async function lesson(withDialogue = false) {
            const owner = randomUUID(),
                note = randomUUID(),
                branch = randomUUID(),
                conversation = randomUUID(),
                turn = randomUUID(),
                lease = turn,
                run = randomUUID();
            const utterance = {
                id: randomUUID(),
                speaker: 'Anne',
                text: 'Bonjour !',
            };
            const utterances = withDialogue
                ? [
                      utterance,
                      { id: randomUUID(), speaker: 'Luc', text: 'Salut !' },
                  ]
                : [utterance];
            const snapshot = {
                version: 'draft:1',
                title: 'Example',
                description: null,
                studiedLanguage: 'fr',
                provenance: 'draft' as const,
                material: [],
                blockTarget: { branchId: branch, version: 1 },
            };
            const task = { id: 'recording', kind: 'audio', language: 'fr' };
            const attempt = {
                turnId: turn,
                taskId: 'recording',
                sourceHash: 'frozen',
                outcome: 'started',
                listeningScript: { title: 'Greeting', utterances },
            };

            await client`insert into users(id,status) values(${owner},'active')`;
            await client`insert into knowledge_notes(id,owner_id,title,summary,body,categories,plain_text,created_at,updated_at)
          values(${note},${owner},'Synthetic listening test','','{}','{}','',now(),now())`;

            await client`insert into knowledge_working_branches(id,note_id,content,updated_at) values(${branch},${note},'{}',now())`;
            await client`insert into conversation_chats(id,owner_id,source_kind,source_id,source,preferences,created_at,updated_at)
          values(${conversation},${owner},'knowledge',${note},'{}','{}',now(),now())`;

            const db = createDrizzleDatabase(client, databaseSchema);
            await db.transaction((tx) =>
                reserveConversationActionFixture(tx, {
                    ownerId: owner,
                    actionId: turn,
                    conversationId: conversation,
                    sourceSnapshot: snapshot,
                    maximumMilli: 0n,
                    funding: 'operator',
                }),
            );

            await client`insert into conversation_generation_runs(id,conversation_id,owner_id,note_id,revision,task_manifest,state,active_turn_id,source_snapshot,created_at,updated_at)
          values(${run},${conversation},${owner},${note},1,${JSON.stringify([task])},'running',${turn},${JSON.stringify(snapshot)},now(),now())`;

            await client`insert into conversation_generation_plan_revisions(run_id,revision,plan,sources,unit_attempts,created_at)
          values(${run},1,${JSON.stringify({ tasks: [task] })},'[]',${JSON.stringify([attempt])},now())`;

            const poll = (token: string, taskId = 'recording') =>
                client`select state,binding_id,result::text as result,failure_code from languon_request_listening_recording(${run},1,${taskId},${turn},${token})`;

            return {
                db,
                poll,
                owner,
                note,
                branch,
                conversation,
                turn,
                run,
                lease,
                utterance,
                utterances,
            };
        }

        it('derives audio exclusively from the frozen task, fences old leases and resumes private playback', async () => {
            const { poll, owner, note, branch, turn, run, lease, utterance } =
                await lesson();

            expect(await poll(randomUUID())).toHaveLength(0);
            expect(await poll(lease, 'other-task')).toHaveLength(0);
            await client.begin(async (tx) => {
                await tx`create role listening_probe nologin`;
                await tx`grant usage on schema public to listening_probe`;
                await tx`grant execute on function languon_request_listening_recording(uuid,integer,text,uuid,uuid) to listening_probe`;
                await tx`set local role listening_probe`;
                expect(
                    (
                        await tx`select has_table_privilege(current_user,'listening_recording_preparations','SELECT') as allowed`
                    )[0]?.allowed,
                ).toBe(false);

                expect(
                    (
                        await tx`select state from languon_request_listening_recording(${run},1,'recording',${turn},${lease})`
                    )[0]?.state,
                ).toBe('pending');

                await tx`reset role`;
                await tx`revoke execute on function languon_request_listening_recording(uuid,integer,text,uuid,uuid) from listening_probe`;
                await tx`revoke usage on schema public from listening_probe`;
                await tx`drop role listening_probe`;
            });

            const allowed = await Promise.all([poll(lease), poll(lease)]);
            expect(allowed.map((rows) => rows[0]?.state)).toEqual([
                'pending',
                'pending',
            ]);

            expect(
                await client`select id from listening_recording_preparations`,
            ).toHaveLength(1);

            const assetId = randomUUID(),
                bindingId = randomUUID();
            const result = {
                assetId,
                transcript: {
                    language: 'fr',
                    segments: [
                        {
                            ...utterance,
                            timing: { startSeconds: 0, endSeconds: 1 },
                        },
                    ],
                },
            };
            const prepare = vi
                .fn(async (input: ListeningSpeechInput) => {
                    expect(input).toMatchObject({
                        ownerId: owner,
                        noteId: note,
                        branchId: branch,
                        language: 'fr',
                        utterances: [utterance],
                    });

                    return result;
                })
                .mockRejectedValueOnce(new ListeningSpeechPending(bindingId));
            const process = createListeningQueueProcessor(
                createDrizzleDatabase(client, databaseSchema),
                prepare,
            );

            await process();
            expect((await poll(lease))[0]).toMatchObject({
                state: 'pending',
                binding_id: bindingId,
            });

            await client`update listening_recording_preparations set due_at=clock_timestamp()`;
            await Promise.all([process(), process()]);
            const ready = (await poll(lease))[0]!;
            expect(ready.state).toBe('ready');
            expect(JSON.parse(ready.result)).toEqual(result);
            expect(prepare).toHaveBeenCalledTimes(2);
            await client`update conversation_turns set cancel_requested=true where id=${turn}`;
            expect(await poll(lease)).toHaveLength(0);
        }, 30000);

        it('admits two voices in the API, runs the targeted worker and returns an owner-scoped replayable asset', async () => {
            const {
                db,
                owner,
                note,
                branch,
                conversation,
                turn,
                run,
                lease,
                utterances,
            } = await lesson(true);
            const auth = {
                authorizationId: randomUUID(),
                revision: 1,
                rootActionId: turn,
                actionIds: [turn],
                maximumCreditsMilli: '0',
                maximumProviderCostMicros: 10000,
                authorizationFingerprint: 'synthetic',
                expiresAt: new Date(Date.now() + 60000).toISOString(),
                stageCount: 1,
                ready: false,
            };

            await client`update conversation_generation_runs set automation=${JSON.stringify(auth)}::jsonb where id=${run}`;
            await client`insert into conversation_listening_allowances(root_turn_id,owner_id,conversation_id,note_id,branch_id,remaining_credits,remaining_provider_micros) values(${turn},${owner},${conversation},${note},${branch},0,10000)`;
            await db.insert(adminMembershipsTable).values({
                id: randomUUID(),
                userId: owner,
                role: 'owner',
                grantedByUserId: owner,
                grantReason: 'Disposable speech fixture',
            });

            await new DrizzleProviderPriceStore(db).publish(
                {
                    expectedVersion: 0,
                    providerId: 'fixture',
                    modelId: 'tone-v1',
                    meter: 'speech-characters',
                    inputUsdPerMillionTokens: null,
                    outputUsdPerMillionTokens: null,
                    cacheReadUsdPerMillionTokens: null,
                    cacheWriteUsdPerMillionTokens: null,
                    usdPer1000Characters: '0.01',
                    effectiveAt: '2020-01-01T00:00:00.000Z',
                    sourceReference: 'Synthetic fixture',
                    sourceUrl: null,
                    reason: 'Synthetic fixture rate',
                },
                owner,
                new Date(),
            );

            await db.insert(capabilityPolicyRevisionsTable).values({
                id: randomUUID(),
                capability: 'speech',
                version: 1,
                funding: 'operator',
                createdAt: new Date(),
                reason: 'Disposable operator speech funding',
            });

            const environment = loadDictionaryAudioEnvironment(
                {
                    SPEECH_PLAYBACK_ENABLED: 'true',
                    SPEECH_GENERATION_ENABLED: 'true',
                    DICTIONARY_AUDIO_PROVIDER: 'fixture',
                    DICTIONARY_AUDIO_FINGERPRINT_SECRET:
                        'synthetic-listening-test-fingerprint',
                },
                { deployed: false, role: 'worker' },
            );
            const provider = new FixtureSpeechProvider();
            const options = {
                database: db,
                dictionaryHmacSecret: 'synthetic-listening-private-test-secret',
                environment,
                storage: new PostgresAudioObjectStorage(db),
                provider,
                playbackEnabled: true,
                generationEnabled: true,
                burstLimiter: { consume: async () => ({ allowed: true }) },
            };
            const worker = createSpeechInfrastructure({
                ...options,
                providers: new Map([[provider.configurationId, provider]]),
            });
            const api = createSpeechInfrastructure({
                ...options,
                providers: new Map(),
            });
            const errors: unknown[] = [];
            const apiLoop = startAccountingMaintenance({
                intervalMs: 30,
                maintain: () => api.processListeningRecording(),
                onError: (e) => errors.push(e),
            });

            try {
                const input = {
                    ownerId: owner,
                    noteId: note,
                    branchId: branch,
                    turnId: turn,
                    runId: run,
                    revision: 1,
                    taskId: 'recording',
                    leaseToken: lease,
                    language: 'fr',
                    utterances,
                    signal: AbortSignal.timeout(45000),
                };
                const result = await worker.prepareListeningRecording(input);
                expect(result.transcript.segments).toMatchObject(utterances);
                expect(result.transcript.segments[1]?.timing).toEqual({
                    startSeconds: 1.25,
                    endSeconds: 2.25,
                });

                expect(await worker.prepareListeningRecording(input)).toEqual(
                    result,
                );

                expect(
                    await client`select r.profile->>'voice' as voice from speech_recordings r order by voice`,
                ).toMatchObject([
                    { voice: 'fixture' },
                    { voice: 'fixture-secondary' },
                ]);

                const assets =
                    await client`select a.id,a.note_id,b.duration_ms from knowledge_media_assets a join knowledge_media_blobs b on b.id=a.blob_id where a.note_id=${note}`;

                expect(assets).toMatchObject([
                    { id: result.assetId, note_id: note, duration_ms: 2250 },
                ]);

                expect(errors).toEqual([]);
            } finally {
                await apiLoop.stop();
            }
        }, 60000);
    },
);
