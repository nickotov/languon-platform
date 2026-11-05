import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import * as c from '../../packages/contracts/dist/index.js';

const day = '2026-10-31';

export function journeyFixture(scenario = 'explanation') {
    const noteId = randomUUID();
    const conversationId = randomUUID();
    const branchId = randomUUID();
    let workingContent;
    const turnId = randomUUID();
    const timestamp = '2026-10-31T10:00:00.000Z';
    const conversation = c.ConversationSchema.parse({
        id: conversationId,
        source: { kind: 'knowledge', id: noteId },
        title: null,
        preferences: {},
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
    });
    const turn = c.ConversationTurnSchema.parse({
        id: turnId,
        conversationId,
        modelId: null,
        status: 'succeeded',
        failureCode: null,
        usage: {
            inputTokens: 50,
            outputTokens: 8,
            chargedCredits: '0.1',
            estimated: false,
        },
        billing: {
            state: 'charged',
            heldCredits: '50',
            chargedCredits: '0.1',
            measurement: 'measured',
        },
        createdAt: timestamp,
        updatedAt: timestamp,
    });
    const message = c.ConversationMessageSchema.parse({
        id: randomUUID(),
        conversationId,
        role: 'assistant',
        content: 'Hello, friend.',
        responseMetadata: { kind: 'learning-explanation', documentUse: true },
        attachments: [],
        status: 'complete',
        sourceVersion: null,
        sourceProvenance: 'saved',
        createdAt: timestamp,
        turnId,
    });
    const detail = c.ConversationDetailSchema.parse({
        conversation,
        turns: [turn],
        messages: [message],
        drafts: [],
    });
    const proposals = [];
    if (scenario === 'shopping-vocabulary') {
        message.responseMetadata = { kind: 'generation', documentUse: false };
        detail.messages[0] = message;
        proposals.push(
            c.KnowledgeBlockProposalSchema.parse({
                id: randomUUID(),
                conversationId,
                turnId,
                noteId,
                branchId,
                baseBranchVersion: 1,
                createdAt: timestamp,
                appliedAt: null,
                appliedBranchVersion: null,
                blocks: [
                    {
                        id: randomUUID(),
                        type: 'vocabulary',
                        language: 'en',
                        translationLanguage: 'ru',
                        entries: Array.from({ length: 50 }, (_, index) => ({
                            id: randomUUID(),
                            term: `shopping word ${index + 1}`,
                            translation: `перевод ${index + 1}`,
                        })),
                    },
                ],
            }),
        );
    }

    const calls = [];
    const api = {
        request: async (path, schema, body) => {
            calls.push({ path, body });
            let result;
            if (path === '/users/me/ai-model-preference') {
                result = {
                    mode: 'auto',
                    modelId: null,
                    version: 1,
                    selectedModel: null,
                    maxCreditsPerAction: '50',
                };
            } else if (path === '/users/me/ai-credits') {
                result = { mode: 'limited', availableCredits: '200' };
            } else if (path === '/knowledge') {
                c.CreateKnowledgeNoteRequestSchema.parse(body);
                workingContent = body.content;
                result = {
                    note: {
                        ...body.content,
                        id: noteId,
                        version: 1,
                        createdAt: timestamp,
                        updatedAt: timestamp,
                    },
                };
            } else if (path === `/knowledge/${noteId}/workspace`) {
                result = {
                    workspace: {
                        noteId,
                        status: 'saved',
                        published: null,
                        branches: [
                            {
                                id: branchId,
                                noteId,
                                version: 1,
                                basePublishedVersion: 1,
                                content: workingContent,
                                updatedAt: timestamp,
                            },
                        ],
                        preferredBranchId: branchId,
                        shareEnabled: false,
                        limits: { referenceChars: 20000, editorChars: 40000 },
                    },
                };
            } else if (path === '/conversations') {
                c.CreateConversationRequestSchema.parse(body);
                result = { conversation };
            } else if (path.endsWith('/turns')) {
                c.SubmitConversationTurnRequestSchema.parse(body);
                // Owner knowledge admission requires an editor snapshot beyond
                // the general turn schema's optional field.
                assert.equal(
                    body.editorContext?.content,
                    workingContent.body.document.content[0].content[0].text,
                );

                assert.deepEqual(body.editorContext.workingBranch, {
                    id: branchId,
                    version: 1,
                });

                assert.ok(
                    calls.findIndex((call) =>
                        call.path.endsWith('/workspace'),
                    ) < calls.findIndex((call) => call.path.endsWith('/turns')),
                );

                assert.match(
                    body.editorContext.editorTarget.documentHash,
                    /^[a-f0-9]{64}$/,
                );

                result = {
                    turn: {
                        ...turn,
                        status: 'queued',
                        billing: {
                            state: 'held',
                            heldCredits: '50',
                            chargedCredits: null,
                            measurement: null,
                        },
                    },
                };
            } else if (path.endsWith('/block-proposals')) {
                result = { proposals };
            } else {
                result = detail;
            }

            return schema.parse(result);
        },
    };
    const initial = {
        day,
        globalExposureMicros: 0,
        actionCredits: '50',
        routingRevision: randomUUID(),
        funding: 'customer',
    };
    const evidence = [];

    return {
        api,
        contracts: c,
        reservation: { id: randomUUID(), day },
        journal: { record: async (...args) => evidence.push(args) },
        inspect: async () => initial,
        initial,
        verifyExpense: async () => 1000,
        calls,
        detail,
        evidence,
        scenario,
        proposals,
    };
}
