// @user-flow-revision contextual-language-assistant-and-knowledge sha256:76dad0ed0457a680
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import {
    ConversationResponseSchema,
    ConversationDetailSchema,
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
        async function draft(token: string, id: string, key?: string) {
            const input = {
                requestId: randomUUID(),
                content:
                    'Please draft a standalone explanation of river bank usage.',
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
            await fixture.conversations.worker!.processNext(signal);
            const result = await detail(token, id, key);
            expect(
                result.turns.find((turn) => turn.id === admitted.id)?.status,
            ).toBe('succeeded');
            expect(
                result.turns.find((turn) => turn.id === admitted.id)?.modelId,
            ).toBe('deepseek-flash');
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
            const proposed = await draft(owner, chat.id);
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
