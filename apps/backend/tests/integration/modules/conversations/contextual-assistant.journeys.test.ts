// @user-flow-revision contextual-language-assistant-and-knowledge sha256:791d02052d9f3558
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { generationRunsTable } from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/conversation-generation-schema';
import { conversationTurnsTable } from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/schema';
import {
    ConversationResponseSchema,
    ConversationDetailSchema,
    GenerationRunDetailSchema,
    KnowledgeWorkspaceResponseSchema,
    ConversationTurnResponseSchema,
    KnowledgeNoteResponseSchema,
    KnowledgeDraftResponseSchema,
    KnowledgeRevisionsResponseSchema,
    ListKnowledgeResponseSchema,
    DictionaryResponseSchema,
    RotateDictionaryShareKeyResponseSchema,
} from '@languon/contracts';
import {
    createContextualAssistantFixture,
    proposedContent,
} from '../../../support/contextual-assistant-fixture';

async function waitForAdmittedTurn<
    T extends {
        turns: { id: string; status: string }[];
    },
>(
    turnId: string,
    read: () => Promise<T>,
    drive: () => Promise<unknown>,
    timeoutMs = 30_000,
): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    let result = await read();
    while (Date.now() < deadline) {
        const status = result.turns.find((turn) => turn.id === turnId)?.status;
        if (
            status === 'succeeded' ||
            status === 'failed' ||
            status === 'cancelled'
        ) {
            return result;
        }

        if (status === 'queued') {
            await drive();
        } else if (status === 'running') {
            await delay(50);
        } else {
            throw new Error(`Admitted conversation turn ${turnId} vanished.`);
        }

        result = await read();
    }

    const status = result.turns.find((turn) => turn.id === turnId)?.status;

    throw new Error(
        `Admitted conversation turn ${turnId} did not finish within ${timeoutMs}ms (status: ${status ?? 'missing'}).`,
    );
}

describe('admitted conversation turn synchronization', () => {
    it('drives another queued turn first, then waits for the admitted turn', async () => {
        let ticks = 0;
        const result = await waitForAdmittedTurn(
            'admitted',
            async () => ({
                turns: [
                    { id: 'other', status: ticks ? 'succeeded' : 'queued' },
                    {
                        id: 'admitted',
                        status: ticks < 2 ? 'queued' : 'succeeded',
                    },
                ],
            }),
            async () => {
                ticks += 1;
            },
            1_000,
        );

        expect(ticks).toBe(2);
        expect(result.turns[1]?.status).toBe('succeeded');
    });

    it('reports a worker that remains running past the deadline', async () => {
        await expect(
            waitForAdmittedTurn(
                'admitted',
                async () => ({
                    turns: [{ id: 'admitted', status: 'running' }],
                }),
                async () => undefined,
                10,
            ),
        ).rejects.toThrow(/did not finish.*status: running/u);
    });
});

describe.runIf(process.env.CONTEXTUAL_ASSISTANT_FIXTURE === 'true')(
    'Contextual assistant composed HTTP journeys',
    () => {
        let fixture: Awaited<
            ReturnType<typeof createContextualAssistantFixture>
        >;
        const signal = new AbortController().signal;
        beforeAll(async () => {
            fixture = await createContextualAssistantFixture();
        }, 120_000);

        afterAll(async () => {
            await fixture?.close();
        }, 120_000);

        async function checked(
            path: string,
            token: string,
            body?: unknown,
            method?: string,
            key?: string,
            expected = 200,
        ) {
            const response = await fixture.request(
                path,
                token,
                body,
                method,
                key,
            );

            expect(response.status, await response.clone().text()).toBe(
                expected,
            );

            return response.json();
        }

        async function conversation(
            token: string,
            source: {
                kind: 'knowledge' | 'text' | 'dictionary';
                id: string;
                shareLocator?: string;
                shareKind?: 'text';
            },
            key?: string,
        ) {
            return ConversationResponseSchema.parse(
                await checked(
                    '/conversations',
                    token,
                    { source },
                    undefined,
                    key,
                ),
            ).conversation;
        }

        async function detail(token: string, id: string, key?: string) {
            return ConversationDetailSchema.parse(
                await checked(
                    `/conversations/${id}`,
                    token,
                    undefined,
                    undefined,
                    key,
                ),
            );
        }

        async function draft(
            token: string,
            id: string,
            key?: string,
            workspace = false,
        ) {
            const workspaceContent =
                'River bank means the land alongside a river.';
            const input = {
                requestId: randomUUID(),
                content:
                    'Please draft a standalone explanation of river bank usage.',
                ...(workspace
                    ? {
                          editorContext: {
                              content: workspaceContent,
                              editorTarget: {
                                  from: workspaceContent.length,
                                  to: workspaceContent.length,
                                  originalText: '',
                                  documentHash: createHash('sha256')
                                      .update(workspaceContent)
                                      .digest('hex'),
                              },
                          },
                      }
                    : {}),
            };
            const admitted = ConversationTurnResponseSchema.parse(
                await checked(
                    `/conversations/${id}/turns`,
                    token,
                    input,
                    undefined,
                    key,
                ),
            ).turn;
            const replay = ConversationTurnResponseSchema.parse(
                await checked(
                    `/conversations/${id}/turns`,
                    token,
                    input,
                    undefined,
                    key,
                ),
            ).turn;

            expect(replay.id).toBe(admitted.id);
            expect(admitted.modelId).toBeNull();
            expect(replay.modelId).toBeNull();
            // The guarded fixture shares a durable queue with the browser
            // server. A tick may claim another turn; a browser worker may own
            // this one. Completion must be observed for the admitted turn.
            const result = await waitForAdmittedTurn(
                admitted.id,
                () => detail(token, id, key),
                () => fixture.conversations.worker!.processNext(signal),
            );

            expect(
                result.turns.find((turn) => turn.id === admitted.id)?.status,
            ).toBe('succeeded');

            expect(
                result.turns.find((turn) => turn.id === admitted.id)?.modelId,
            ).toBeNull();

            // Provider identities are private in the HTTP contract. Prove the
            // actual selected execution and dispatch through the real ledger row.
            const [executed] = await fixture.database
                .select({
                    execution: conversationTurnsTable.execution,
                    providerDispatched:
                        conversationTurnsTable.providerDispatched,
                })
                .from(conversationTurnsTable)
                .where(eq(conversationTurnsTable.id, admitted.id));

            expect(executed?.execution.snapshot).toMatchObject({
                modelId: 'deepseek-flash',
            });

            expect(executed?.providerDispatched).toBe(true);
            expect(
                result.turns.find((turn) => turn.id === admitted.id)?.usage
                    .inputTokens,
            ).toBeGreaterThan(0);

            expect(
                result.messages.filter((message) => message.role === 'user'),
            ).toHaveLength(1);

            expect(
                result.messages.some(
                    (message) =>
                        message.role === 'assistant' &&
                        message.content.includes('river bank'),
                ),
            ).toBe(true);

            expect(result.drafts).toHaveLength(1);
            const subscription = new AbortController();
            const replayResponse = await fixture.app.request(
                `/conversations/${id}/events?after=0`,
                {
                    headers: {
                        Origin: 'http://localhost:3336',
                        Authorization: `Bearer ${token}`,
                        ...(key ? { 'X-Languon-Share-Key': key } : {}),
                    },
                    signal: subscription.signal,
                },
            );

            expect(replayResponse.headers.get('content-type')).toContain(
                'text/event-stream',
            );

            const reader = replayResponse.body!.getReader();
            try {
                const first = await reader.read();
                const payload = new TextDecoder().decode(first.value);
                expect(payload).toContain('event: conversation');
                expect(payload).toContain('"type":"snapshot"');
                expect(payload).toContain(result.drafts[0]!.id);
                expect(payload).toContain('"status":"succeeded"');
            } finally {
                subscription.abort();
                await reader.cancel();
            }

            return result.drafts[0]!;
        }

        it('restores the paid recording offer by HTTP and admits a duplicate approval once; expired consent refreshes the original plan', async () => {
            const owner = await fixture.signup();

            async function offer() {
                const { workspace } = KnowledgeWorkspaceResponseSchema.parse(
                    await checked(
                        '/knowledge/drafts',
                        owner,
                        { operationId: randomUUID() },
                        undefined,
                        undefined,
                        201,
                    ),
                );
                const chat = await conversation(owner, {
                    kind: 'knowledge',
                    id: workspace.noteId,
                });
                const branch = workspace.branches[0]!;
                const route = `/conversations/${chat.id}`;
                const { turn } = ConversationTurnResponseSchema.parse(
                    await checked(`${route}/turns`, owner, {
                        requestId: randomUUID(),
                        content: 'Listening lesson fixture',
                        editorContext: {
                            content: '',
                            editorTarget: {
                                from: 0,
                                to: 0,
                                originalText: '',
                                documentHash: createHash('sha256')
                                    .update('')
                                    .digest('hex'),
                            },
                            workingBranch: {
                                id: branch.id,
                                version: branch.version,
                            },
                        },
                    }),
                );

                await waitForAdmittedTurn(
                    turn.id,
                    () => detail(owner, chat.id),
                    () => fixture.conversations.worker!.processNext(signal),
                );

                // Admission runs in the API independently of the browser or an open SSE connection.
                await fixture.conversations.store.prepareNextRecordingLesson();
                const listed = await checked(`${route}/generation-runs`, owner);
                const runRoute = `${route}/generation-runs/${listed.runs[0].id}`;
                const first = GenerationRunDetailSchema.parse(
                    await checked(runRoute, owner),
                );
                const reloaded = GenerationRunDetailSchema.parse(
                    await checked(runRoute, owner),
                );

                expect(first.run).toMatchObject({
                    state: 'paused',
                    pauseReason: 'recording-confirmation',
                    completedTaskCount: 0,
                    recordingApproval: { quote: { scope: 'listening-lesson' } },
                });

                expect(reloaded.run.recordingApproval).toEqual(
                    first.run.recordingApproval,
                );

                const approval = first.run.recordingApproval!;
                expect(Number(approval.quote.maximumCredits)).toBeGreaterThan(
                    0,
                );

                return {
                    chat,
                    runRoute,
                    first,
                    command: {
                        requestId: approval.requestId,
                        confirmedQuoteId: approval.quote.id,
                        expectedRevision: first.run.revision,
                    },
                };
            }

            const current = await offer();
            const responses = await Promise.all(
                [1, 2].map(() =>
                    fixture.request(
                        `${current.runRoute}/continue`,
                        owner,
                        current.command,
                    ),
                ),
            );

            // Overlapping submissions can hit the per-owner capacity guard.
            // Replaying either click after the winner commits returns that same turn.
            expect(
                responses.every((response) =>
                    [200, 503].includes(response.status),
                ),
            ).toBe(true);

            const winner = responses.find((response) => response.ok);
            expect(winner).toBeDefined();
            const accepted = ConversationTurnResponseSchema.parse(
                await winner!.json(),
            );
            const replay = await checked(
                `${current.runRoute}/continue`,
                owner,
                current.command,
            );

            expect(ConversationTurnResponseSchema.parse(replay).turn.id).toBe(
                accepted.turn.id,
            );

            const [ledger] = await fixture.database
                .select({ count: sql<number>`count(*)::integer` })
                .from(conversationTurnsTable)
                .where(
                    eq(
                        conversationTurnsTable.generationRunId,
                        current.first.run.id,
                    ),
                );

            expect(ledger!.count).toBe(2);
            await checked(`${current.runRoute}/stop`, owner, {
                requestId: randomUUID(),
                expectedRevision: 1,
            });

            const expired = await offer();
            // Simulate the learner reopening the chat after the original action deadline.
            const [stored] = await fixture.database
                .select()
                .from(generationRunsTable)
                .where(eq(generationRunsTable.id, expired.first.run.id));

            await fixture.database
                .update(generationRunsTable)
                .set({
                    automation: {
                        ...stored!.automation!,
                        expiresAt: '2000-01-01T00:00:00.000Z',
                    },
                })
                .where(eq(generationRunsTable.id, expired.first.run.id));

            const counts = async () => {
                const [row] = await fixture.database
                    .select({ count: sql<number>`count(*)::integer` })
                    .from(conversationTurnsTable)
                    .where(
                        eq(
                            conversationTurnsTable.generationRunId,
                            expired.first.run.id,
                        ),
                    );

                return row!.count;
            };
            const path = `${expired.runRoute}/continue`;
            const { confirmedQuoteId: staleQuote, ...refresh } =
                expired.command;

            // The scheduler cannot renew or accept an existing offer in the background.
            await fixture.conversations.store.prepareNextRecordingLesson();
            expect(await counts()).toBe(1);
            const refreshed = await checked(
                path,
                owner,
                refresh,
                undefined,
                undefined,
                409,
            );

            expect(refreshed.error.code).toBe('action_confirmation_required');
            const freshQuote = refreshed.error.details.quote;
            expect(freshQuote.scope).toBe('listening-lesson');
            expect(freshQuote.id).not.toBe(staleQuote);

            const recovered = GenerationRunDetailSchema.parse(
                await checked(expired.runRoute, owner),
            );

            expect(recovered.run).toMatchObject({
                state: 'paused',
                pauseReason: 'recording-confirmation',
                recordingApproval: {
                    requestId: refresh.requestId,
                    quote: freshQuote,
                },
            });

            expect(recovered.plan).toEqual(expired.first.plan);
            // Lost replies and stale tabs reuse the current offer without rotating its ID.
            const stale = await checked(
                path,
                owner,
                expired.command,
                undefined,
                undefined,
                409,
            );

            expect(stale.error.details.quote.id).toBe(freshQuote.id);
            expect(await counts()).toBe(1);
            const accept = { ...refresh, confirmedQuoteId: freshQuote.id };
            const firstAdmission = ConversationTurnResponseSchema.parse(
                await checked(path, owner, accept),
            );
            const replayed = ConversationTurnResponseSchema.parse(
                await checked(path, owner, accept),
            );

            expect(replayed.turn.id).toBe(firstAdmission.turn.id);
            expect(await counts()).toBe(2);
        }, 60_000);

        // @user-flow contextual-language-assistant-and-knowledge/knowledge-revision-stale-delete
        it('retains stale drafts, preserves revisions, and cannot publish an update after note deletion', async () => {
            const owner = await fixture.signup();
            const stranger = await fixture.signup();
            const note = KnowledgeNoteResponseSchema.parse(
                await checked(
                    '/knowledge',
                    owner,
                    { operationId: randomUUID(), content: proposedContent },
                    undefined,
                    undefined,
                    201,
                ),
            ).note;
            const chat = await conversation(owner, {
                kind: 'knowledge',
                id: note.id,
            });

            expect(
                (await fixture.request(`/conversations/${chat.id}`, stranger))
                    .status,
            ).toBe(404);

            const proposed = await draft(owner, chat.id, undefined, true);
            const edited = KnowledgeNoteResponseSchema.parse(
                await checked(
                    `/knowledge/${note.id}`,
                    owner,
                    {
                        operationId: randomUUID(),
                        expectedVersion: note.version,
                        content: {
                            ...proposedContent,
                            title: 'Learner revised river bank',
                        },
                    },
                    'PATCH',
                ),
            ).note;
            const publication = {
                operationId: randomUUID(),
                expectedVersion: proposed.version,
                mode: 'update',
                expectedNoteVersion: note.version,
            };
            const stale = await fixture.request(
                `/conversations/${chat.id}/drafts/${proposed.id}/publish`,
                owner,
                publication,
            );

            expect(stale.status).toBe(409);
            expect((await detail(owner, chat.id)).drafts[0]?.id).toBe(
                proposed.id,
            );

            const revisedDraft = KnowledgeDraftResponseSchema.parse(
                await checked(
                    `/conversations/${chat.id}/drafts/${proposed.id}`,
                    owner,
                    {
                        expectedVersion: proposed.version,
                        content: {
                            ...proposed.content,
                            title: 'Independent river bank explanation',
                        },
                    },
                    'PATCH',
                ),
            ).draft;
            const independent = KnowledgeNoteResponseSchema.parse(
                await checked(
                    `/conversations/${chat.id}/drafts/${proposed.id}/publish`,
                    owner,
                    {
                        operationId: randomUUID(),
                        expectedVersion: revisedDraft.version,
                        mode: 'new',
                    },
                ),
            ).note;

            expect(independent.id).not.toBe(note.id);
            const restored = KnowledgeNoteResponseSchema.parse(
                await checked(`/knowledge/${note.id}/restore`, owner, {
                    operationId: randomUUID(),
                    expectedVersion: edited.version,
                    revisionVersion: 1,
                }),
            ).note;

            expect(restored.version).toBe(3);
            expect(restored.title).toBe(proposedContent.title);
            const revisions = KnowledgeRevisionsResponseSchema.parse(
                await checked(`/knowledge/${note.id}/revisions`, owner),
            ).revisions;

            expect(
                revisions.map((revision) => revision.version).sort(),
            ).toEqual([1, 2, 3]);

            await checked(
                `/knowledge/${note.id}`,
                owner,
                {
                    operationId: randomUUID(),
                    expectedVersion: restored.version,
                },
                'DELETE',
            );

            expect(
                (await fixture.request(`/knowledge/${note.id}`, owner)).status,
            ).toBe(404);

            expect(
                (await fixture.request(`/conversations/${chat.id}`, owner))
                    .status,
            ).toBe(404);

            expect(
                (
                    await fixture.request(
                        `/conversations/${chat.id}/drafts/${proposed.id}/publish`,
                        owner,
                        publication,
                    )
                ).status,
            ).toBe(404);

            expect(
                KnowledgeNoteResponseSchema.parse(
                    await checked(`/knowledge/${independent.id}`, owner),
                ).note.id,
            ).toBe(independent.id);

            expect(
                ListKnowledgeResponseSchema.parse(
                    await checked('/knowledge', stranger),
                ).notes,
            ).toEqual([]);
        }, 90_000);

        // @user-flow contextual-language-assistant-and-knowledge/private-shared-source-lifecycle
        it('isolates a shared dictionary reader chat, checks the share capability, and retains independently saved Knowledge after revocation', async () => {
            const owner = await fixture.signup(),
                reader = await fixture.signup();
            const dictionary = DictionaryResponseSchema.parse(
                await checked(
                    '/dictionaries',
                    owner,
                    {
                        name: 'River words',
                        sourceLanguage: 'en',
                        targetLanguage: 'es',
                    },
                    undefined,
                    undefined,
                    201,
                ),
            ).dictionary;
            const shared = RotateDictionaryShareKeyResponseSchema.parse(
                await checked(
                    `/dictionaries/${dictionary.id}/share-key/rotate`,
                    owner,
                    { expectedDictionaryVersion: dictionary.version },
                ),
            );
            const share = shared.capability;
            const source = {
                kind: 'dictionary' as const,
                id: dictionary.id,
                shareLocator: share.shareId,
            };

            expect(
                (await fixture.request('/conversations', reader, { source }))
                    .status,
            ).toBe(404);

            const chat = await conversation(reader, source, share.shareKey);
            expect(
                (
                    await fixture.request(
                        `/conversations/${chat.id}`,
                        owner,
                        undefined,
                        undefined,
                        share.shareKey,
                    )
                ).status,
            ).toBe(404);

            const proposed = await draft(reader, chat.id, share.shareKey);
            const independent = KnowledgeNoteResponseSchema.parse(
                await checked(
                    `/conversations/${chat.id}/drafts/${proposed.id}/publish`,
                    reader,
                    {
                        operationId: randomUUID(),
                        expectedVersion: proposed.version,
                        mode: 'new',
                    },
                    undefined,
                    share.shareKey,
                ),
            ).note;

            await checked(
                `/dictionaries/${dictionary.id}/share-key/rotate`,
                owner,
                { expectedDictionaryVersion: shared.dictionary.version },
            );

            expect(
                (
                    await fixture.request(
                        `/conversations/${chat.id}`,
                        reader,
                        undefined,
                        undefined,
                        share.shareKey,
                    )
                ).status,
            ).toBe(404);

            expect(
                KnowledgeNoteResponseSchema.parse(
                    await checked(`/knowledge/${independent.id}`, reader),
                ).note.title,
            ).toBe(proposedContent.title);
        }, 90_000);
    },
);
