import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type PropsWithChildren } from 'react';
import { isAuthenticationRequiredError } from '@languon/browser-auth';
import { PortraitInterviewLastAttemptSchema } from '@languon/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    portraitApi,
    PortraitApiError,
    portraitQueryKey,
    setPortraitStateCache,
    usePortraitState,
} from '@/fsd/entities/learner-portrait';

const empty = {
    version: 0,
    approvedVersion: 0,
    generation: 0,
    useEnabled: false,
    approved: null,
    draft: null,
};
const operationId = '7d99d20f-0fe2-42ea-a01d-d69677d44fd1';
const response = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });
afterEach(() => vi.unstubAllGlobals());

describe('learner portrait transport', () => {
    it.each(['failed', 'cancelled'] as const)(
        'restores a %s answer as private, editable recovery data without resubmission',
        async (state) => {
            const session = {
                interviewId: operationId,
                expiresAt: '2026-11-01T00:00:00.000Z',
                context: {
                    locale: 'en',
                    approvedItems: null,
                    draftItems: null,
                    messages: [],
                    completedTopics: [],
                },
                initialQuestion: {
                    message: 'What helps you learn?',
                    topic: 'accommodations',
                    options: [],
                    multiSelect: true,
                },
                creditsBypass: true,
                lastAttempt: {
                    id: operationId,
                    interviewId: operationId,
                    state,
                    input: {
                        kind: 'answer',
                        topic: 'accommodations',
                        text: 'Short steps, please.',
                    },
                    errorCode: state === 'failed' ? 'model_unavailable' : null,
                    baseVersion: 2,
                    baseGeneration: 0,
                    stale: false,
                },
            };
            const fetcher = vi.fn().mockResolvedValue(response(session));
            vi.stubGlobal('fetch', fetcher);
            await expect(
                portraitApi.startInterview('token', {
                    expectedVersion: 2,
                    locale: 'en',
                }),
            ).resolves.toEqual(session);
            expect(fetcher).toHaveBeenCalledTimes(1);
            expect(fetcher.mock.calls[0]?.[0]).toMatch(
                /\/learner-portrait\/interview$/,
            );
            fetcher.mockResolvedValue(
                response({
                    ...session,
                    lastAttempt: {
                        ...session.lastAttempt,
                        execution: { prompt: 'private sentinel' },
                    },
                }),
            );
            const error = await portraitApi
                .startInterview('token', { expectedVersion: 2, locale: 'en' })
                .catch((error) => error);
            expect(error).toMatchObject({ code: 'invalid_response' });
            expect(JSON.stringify(error)).not.toContain('private sentinel');
        },
    );
    it('rejects private fields, invalid recovery states, and malformed error details in a last attempt', () => {
        const attempt = {
            id: operationId,
            interviewId: operationId,
            state: 'failed',
            input: {
                kind: 'chat',
                topic: 'style',
                text: 'Can you explain the difference?',
            },
            errorCode: 'model_unavailable',
            baseVersion: 2,
            baseGeneration: 0,
            stale: true,
        };
        expect(
            PortraitInterviewLastAttemptSchema.safeParse(attempt).success,
        ).toBe(true);
        for (const extra of [
            { ownerId: 'other-owner' },
            { context: { locale: 'en' } },
            { result: { message: 'private' } },
        ]) {
            expect(
                PortraitInterviewLastAttemptSchema.safeParse({
                    ...attempt,
                    ...extra,
                }).success,
            ).toBe(false);
        }
        expect(
            PortraitInterviewLastAttemptSchema.safeParse({
                ...attempt,
                input: { ...attempt.input, ownerId: 'other-owner' },
            }).success,
        ).toBe(false);
        expect(
            PortraitInterviewLastAttemptSchema.safeParse({
                ...attempt,
                state: 'succeeded',
            }).success,
        ).toBe(false);
        expect(
            PortraitInterviewLastAttemptSchema.safeParse({
                ...attempt,
                errorCode: { message: 'private' },
            }).success,
        ).toBe(false);
        expect(
            PortraitInterviewLastAttemptSchema.safeParse({
                ...attempt,
                baseGeneration: -1,
            }).success,
        ).toBe(false);
        expect(
            PortraitInterviewLastAttemptSchema.safeParse({
                ...attempt,
                input: {
                    kind: 'answer',
                    topic: 'goals',
                    text: 'x'.repeat(201),
                },
            }).success,
        ).toBe(false);
    });
    it('reads bounded private interview metadata without starting or refreshing it', async () => {
        const metadata = {
            interview: {
                id: operationId,
                locale: 'fr',
                expiresAt: '2026-11-01T00:00:00.000Z',
            },
            creditsBypass: false,
        };
        const fetcher = vi.fn().mockResolvedValue(response(metadata));
        vi.stubGlobal('fetch', fetcher);
        await expect(portraitApi.readInterviewStatus('token')).resolves.toEqual(
            metadata,
        );
        expect(fetcher).toHaveBeenCalledWith(
            expect.stringContaining('/learner-portrait/interview/status'),
            expect.objectContaining({ method: 'GET', cache: 'no-store' }),
        );
        fetcher.mockResolvedValue(
            response({ ...metadata, transcript: ['private sentinel'] }),
        );
        await expect(
            portraitApi.readInterviewStatus('token'),
        ).rejects.toMatchObject({ code: 'invalid_response' });
    });
    it('authenticates a validated versioned write without browser caching', async () => {
        const fetcher = vi.fn().mockResolvedValue(response(empty));
        vi.stubGlobal('fetch', fetcher);
        await portraitApi.setUse('owner-session', {
            expectedVersion: 3,
            enabled: false,
        });
        expect(fetcher).toHaveBeenCalledWith(
            expect.stringContaining('/learner-portrait/use'),
            expect.objectContaining({
                method: 'PATCH',
                cache: 'no-store',
                credentials: 'include',
                headers: {
                    Authorization: 'Bearer owner-session',
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ expectedVersion: 3, enabled: false }),
                signal: expect.any(AbortSignal),
            }),
        );
    });
    it('validates destructive confirmation and operation identifiers before transport', () => {
        const fetcher = vi.fn();
        vi.stubGlobal('fetch', fetcher);
        expect(() =>
            portraitApi.remove('token', {
                expectedVersion: 0,
                confirmed: false as true,
            }),
        ).toThrow();
        expect(() =>
            portraitApi.readOperation('token', '../other-account'),
        ).toThrow();
        expect(fetcher).not.toHaveBeenCalled();
    });
    it.each([
        'version_conflict',
        'resource_limit',
        'credits_exhausted',
        'billing_notice_required',
    ])('preserves actionable %s errors', async (code) => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                response(
                    {
                        error: {
                            code,
                            message: 'Review the request.',
                            correlationId: 'test-correlation',
                        },
                    },
                    409,
                ),
            ),
        );
        await expect(portraitApi.read('token')).rejects.toMatchObject({
            status: 409,
            code,
            detail: { correlationId: 'test-correlation' },
        });
    });
    it('preserves authentication errors for the session refresh coordinator', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                response(
                    {
                        error: {
                            code: 'authentication_required',
                            message: 'Sign in.',
                            correlationId: 'test',
                        },
                    },
                    401,
                ),
            ),
        );
        const error = await portraitApi.read('token').catch((error) => error);
        expect(error).toBeInstanceOf(PortraitApiError);
        expect(isAuthenticationRequiredError(error)).toBe(true);
    });
    it('rejects malformed personal responses without surfacing their contents', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                response({
                    ...empty,
                    privateUnexpected: 'private sentinel',
                }),
            ),
        );
        const error = await portraitApi.read('token').catch((error) => error);
        expect(error).toMatchObject({ code: 'invalid_response' });
        expect(JSON.stringify(error)).not.toContain('private sentinel');
    });
    it('bounds streamed response bytes and rejects invalid gateway bodies', async () => {
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValue(
                    new Response('a'.repeat(250_001), { status: 200 }),
                ),
        );
        await expect(portraitApi.read('token')).rejects.toMatchObject({
            code: 'invalid_response',
        });
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValue(
                    new Response('gateway failed', { status: 503 }),
                ),
        );
        await expect(portraitApi.read('token')).rejects.toMatchObject({
            status: 503,
            code: 'service_unavailable',
        });
    });
    it('validates resumed interview context and pending proposal metadata', async () => {
        const session = {
            interviewId: operationId,
            expiresAt: '2026-11-01T00:00:00.000Z',
            context: {
                locale: 'en',
                approvedItems: null,
                draftItems: null,
                messages: [],
                completedTopics: [],
            },
            initialQuestion: {
                message: 'What languages are you learning?',
                topic: 'languages',
                options: [],
                multiSelect: true,
            },
            creditsBypass: true,
        };
        const fetcher = vi.fn().mockResolvedValue(response(session));
        vi.stubGlobal('fetch', fetcher);
        await expect(
            portraitApi.startInterview('token', {
                expectedVersion: 0,
                locale: 'en',
            }),
        ).resolves.toEqual(session);
        fetcher.mockResolvedValue(
            response({
                ...session,
                context: {
                    ...session.context,
                    messages: [{ role: 'system', content: 'private sentinel' }],
                },
            }),
        );
        await expect(
            portraitApi.startInterview('token', {
                expectedVersion: 0,
                locale: 'en',
            }),
        ).rejects.toMatchObject({ code: 'invalid_response' });
    });
    it('reads and stops the exact durable operation without accepting path traversal', async () => {
        const operation = {
            id: operationId,
            interviewId: operationId,
            state: 'running',
            result: null,
            errorCode: null,
        };
        const fetcher = vi
            .fn()
            .mockImplementation(() => Promise.resolve(response(operation)));
        vi.stubGlobal('fetch', fetcher);
        await portraitApi.readOperation('token', operationId);
        await portraitApi.stopOperation('token', operationId);
        expect(fetcher.mock.calls[0]?.[0]).toContain(
            `/interview/responses/${operationId}`,
        );
        expect(fetcher.mock.calls[1]?.[0]).toContain(
            `/interview/responses/${operationId}/stop`,
        );
        expect(fetcher.mock.calls[1]?.[1]).toMatchObject({ method: 'POST' });
    });
});

describe('portrait owner-scoped cache', () => {
    it('does not let an older pending read replace a newer approved mutation', async () => {
        const client = new QueryClient();
        let finish: ((value: Response) => void) | undefined;
        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation(
                () =>
                    new Promise<Response>((resolve) => {
                        finish = resolve;
                    }),
            ),
        );
        const requestWithSession = <T>(
            operation: (token: string) => Promise<T>,
        ) => operation('token');
        const wrapper = ({ children }: PropsWithChildren) =>
            createElement(QueryClientProvider, { client }, children);
        const hook = renderHook(
            () => usePortraitState({ ownerId: 'owner-a', requestWithSession }),
            { wrapper },
        );
        act(() =>
            setPortraitStateCache(client, 'owner-a', { ...empty, version: 8 }),
        );
        await act(async () => {
            finish?.(response({ ...empty, version: 7 }));
        });
        await waitFor(() =>
            expect(hook.result.current.fetchStatus).toBe('idle'),
        );
        expect(hook.result.current.data?.version).toBe(8);
        hook.unmount();
        client.clear();
    });
    it('isolates owners and refuses a delayed older state after deletion', () => {
        const client = new QueryClient();
        setPortraitStateCache(client, 'owner-a', {
            ...empty,
            version: 5,
            generation: 1,
        });
        setPortraitStateCache(client, 'owner-a', {
            ...empty,
            version: 4,
            useEnabled: true,
        });
        setPortraitStateCache(client, 'owner-b', { ...empty, version: 2 });
        expect(client.getQueryData(portraitQueryKey('owner-a'))).toMatchObject({
            version: 5,
            useEnabled: false,
        });
        expect(client.getQueryData(portraitQueryKey('owner-b'))).toMatchObject({
            version: 2,
        });
        client.clear();
    });
    it('never exposes another owner data while the new owner fetch is pending', async () => {
        const client = new QueryClient();
        const requestWithSession = vi.fn((operation) => operation('session'));
        let finish: ((value: Response) => void) | undefined;
        const fetcher = vi
            .fn()
            .mockResolvedValueOnce(response({ ...empty, version: 5 }))
            .mockImplementationOnce(
                () =>
                    new Promise<Response>((resolve) => {
                        finish = resolve;
                    }),
            );
        vi.stubGlobal('fetch', fetcher);
        const wrapper = ({ children }: PropsWithChildren) =>
            createElement(QueryClientProvider, { client }, children);
        const hook = renderHook(
            ({ ownerId }) => usePortraitState({ ownerId, requestWithSession }),
            { wrapper, initialProps: { ownerId: 'owner-a' } },
        );
        await waitFor(() => expect(hook.result.current.data?.version).toBe(5));
        hook.rerender({ ownerId: 'owner-b' });
        expect(hook.result.current.data).toBeUndefined();
        await act(async () => {
            finish?.(response({ ...empty, version: 2 }));
        });
        await waitFor(() => expect(hook.result.current.data?.version).toBe(2));
        hook.unmount();
        client.clear();
    });
    it('does not request a portrait without an authenticated owner', async () => {
        const client = new QueryClient();
        const requestWithSession = vi.fn();
        const wrapper = ({ children }: PropsWithChildren) =>
            createElement(QueryClientProvider, { client }, children);
        const hook = renderHook(
            () => usePortraitState({ ownerId: null, requestWithSession }),
            { wrapper },
        );
        expect(requestWithSession).not.toHaveBeenCalled();
        hook.unmount();
        client.clear();
    });
});
