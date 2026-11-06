import { createHash, randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { z } from 'zod';
import { API, ORIGIN, EMAIL, requireSafe, SmokeError } from './policy.mjs';
import { smokeScenario, verifyScenarioOutput } from './scenarios.mjs';

export function createApi(contracts, fetchImpl = fetch) {
    let token;
    let cookie;
    const request = async (path, schema, body) => {
        requireSafe(
            path.startsWith('/') && !path.startsWith('//'),
            'invalid-api-path',
        );

        let response;
        try {
            response = await fetchImpl(`${API}${path}`, {
                method: body === undefined ? 'GET' : 'POST',
                redirect: 'error',
                signal: AbortSignal.timeout(15000),
                headers: {
                    Origin: ORIGIN,
                    ...(body === undefined
                        ? {}
                        : { 'Content-Type': 'application/json' }),
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    ...(path === '/auth/logout' && cookie
                        ? { Cookie: cookie }
                        : {}),
                },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            });
        } catch {
            throw new SmokeError('http-outcome-unknown-no-retry');
        }

        requireSafe(response.ok, `http-${response.status}-no-retry`);
        if (path === '/auth/login/password') {
            cookie = response.headers.get('set-cookie')?.split(';')[0];
        }

        const parsed = schema.safeParse(await response.json());
        requireSafe(parsed.success, 'api-contract-mismatch');

        return parsed.data;
    };

    return {
        request,
        login: async (credentials) => {
            const login = await request(
                '/auth/login/password',
                contracts.AuthenticationSuccessResponseSchema,
                contracts.PasswordLoginRequestSchema.parse({
                    email: EMAIL,
                    password: credentials.AI_SMOKE_PASSWORD,
                }),
            );

            requireSafe(
                login.user.id === credentials.AI_SMOKE_USER_ID &&
                    login.user.primaryEmail === EMAIL,
                'authenticated-user-mismatch',
            );

            token = login.accessToken;

            return login;
        },
        logout: async () => {
            if (cookie) {
                await request(
                    '/auth/logout',
                    contracts.LogoutResponseSchema,
                    {},
                );
            }

            token = undefined;
            cookie = undefined;
        },
    };
}

export async function runJourney({
    api,
    contracts: c,
    journal,
    reservation,
    inspect,
    initial,
    verifyExpense,
    scenario = 'explanation',
    sleep = setTimeout,
    now = Date.now,
}) {
    const config = smokeScenario(scenario);
    const preference = await api.request(
        '/users/me/ai-model-preference',
        c.TextAiPreferenceResponseSchema,
    );
    const balance = await api.request(
        '/users/me/ai-credits',
        c.LearnerAiCreditBalanceSchema,
    );

    requireSafe(
        preference.maxCreditsPerAction === initial.actionCredits &&
            Number(preference.maxCreditsPerAction) > 0 &&
            Number(preference.maxCreditsPerAction) <= 50 &&
            balance.mode === 'limited' &&
            Number(balance.availableCredits) >=
                Number(preference.maxCreditsPerAction),
        'learner-api-budget-mismatch',
    );

    const { note } = await api.request(
        '/knowledge',
        c.KnowledgeNoteResponseSchema,
        c.CreateKnowledgeNoteRequestSchema.parse({
            operationId: reservation.id,
            content: {
                title: config.title,
                summary: 'Disposable synthetic language-learning context.',
                body: {
                    schemaVersion: 2,
                    document: {
                        type: 'doc',
                        content: [
                            {
                                type: 'paragraph',
                                content: [
                                    {
                                        type: 'text',
                                        text: config.context,
                                    },
                                ],
                            },
                        ],
                    },
                },
                categories: ['vocabulary'],
                studiedLanguage: 'en',
                explanationLanguage: config.explanationLanguage,
            },
        }),
    );

    await journal.record(reservation.id, { noteId: note.id });
    // Match the owned editor startup: an explicit branch enables workspace tools.
    const { workspace } = await api.request(
        `/knowledge/${note.id}/workspace`,
        c.KnowledgeWorkspaceResponseSchema,
    );
    const branch = workspace.branches.find(
        (candidate) => candidate.id === workspace.preferredBranchId,
    );

    requireSafe(Boolean(branch), 'workspace-branch-missing-no-dispatch');
    const { conversation } = await api.request(
        '/conversations',
        z.object({ conversation: c.ConversationSchema }).strict(),
        c.CreateConversationRequestSchema.parse({
            source: { kind: 'knowledge', id: note.id },
            preferences: {
                replyLanguage: 'en',
                detail: 'concise',
                wording: 'simple',
                portrait: { enabled: false, inheritedFields: [] },
            },
        }),
    );

    await journal.record(reservation.id, { conversationId: conversation.id });
    const latest = await inspect();
    requireSafe(
        latest.day === reservation.day &&
            latest.routingRevision === initial.routingRevision &&
            latest.actionCredits === initial.actionCredits &&
            latest.funding === initial.funding &&
            latest.globalExposureMicros <= initial.globalExposureMicros,
        'preflight-changed-no-dispatch',
    );

    const { turn } = await api.request(
        `/conversations/${conversation.id}/turns`,
        z.object({ turn: c.ConversationTurnSchema }).strict(),
        c.SubmitConversationTurnRequestSchema.parse({
            requestId: randomUUID(),
            content: config.prompt,
            attachments: [],
            editorContext: {
                workingBranch: { id: branch.id, version: branch.version },
                content: config.context,
                editorTarget: {
                    from: 0,
                    to: 0,
                    originalText: '',
                    documentHash: createHash('sha256')
                        .update(config.context)
                        .digest('hex'),
                },
            },
        }),
    );

    await journal.record(reservation.id, { turnId: turn.id });
    const deadline = now() + 180000;
    while (now() < deadline) {
        const detail = await api.request(
            `/conversations/${conversation.id}`,
            c.ConversationDetailSchema,
        );
        const current = detail.turns.find((item) => item.id === turn.id);
        requireSafe(Boolean(current), 'persisted-turn-missing');
        if (['failed', 'cancelled'].includes(current.status)) {
            throw new SmokeError('learner-turn-failed-no-retry');
        }

        if (
            current.status === 'succeeded' &&
            current.billing?.state !== 'held'
        ) {
            requireSafe(
                (initial.funding === 'customer'
                    ? current.billing?.state === 'charged' &&
                      Number(current.billing.chargedCredits) > 0
                    : initial.funding === 'operator' &&
                      current.billing?.state === 'free' &&
                      Number(current.billing.chargedCredits) === 0) &&
                    detail.messages.some(
                        (message) =>
                            message.turnId === turn.id &&
                            message.role === 'assistant' &&
                            message.status === 'complete' &&
                            message.content.trim().length > 0,
                    ),
                'persisted-output-or-billing-missing',
            );

            const scenarioEvidence = await verifyScenarioOutput({
                scenario,
                api,
                contracts: c,
                detail,
                conversationId: conversation.id,
                turnId: turn.id,
                noteId: note.id,
                branch,
            });

            const providerExpenseMicros = await verifyExpense(
                turn.id,
                initial.funding,
            );

            await journal.record(reservation.id, {
                status: 'succeeded',
                chargedCredits: current.billing.chargedCredits,
                providerExpenseMicros,
            });

            return {
                status: 'succeeded',
                conversationId: conversation.id,
                turnId: turn.id,
                chargedCredits: current.billing.chargedCredits,
                responsePersisted: true,
                billing: current.billing.state,
                providerExpenseMicros,
                ...scenarioEvidence,
            };
        }

        await sleep(1000);
    }

    throw new SmokeError('poll-timeout-no-retry-reservation-retained');
}
