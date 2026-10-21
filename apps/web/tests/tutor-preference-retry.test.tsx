import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
    ChatPreferencesSchema,
    ConversationDetailSchema,
} from '@languon/contracts';
import { conversationApi } from '../src/fsd/entities/conversation';
import { I18nProvider } from '../src/fsd/shared/i18n';
import { en } from '../src/fsd/shared/i18n/messages/en';
import { useAssistantPanel } from '../src/fsd/widgets/contextual-assistant/hooks/use-assistant-panel';

const stream = vi.hoisted(() => ({ submit: vi.fn(), reconnect: vi.fn() }));
vi.mock(
    '../src/fsd/widgets/contextual-assistant/hooks/use-conversation-stream',
    () => ({
        useConversationStream: () => ({ ...stream, unavailable: false }),
    }),
);
vi.mock('../src/fsd/features/auth', () => ({
    useAuth: () => ({
        requestWithSession: <T,>(operation: (token: string) => Promise<T>) =>
            operation('synthetic-token'),
    }),
}));
afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
});
const id = '00000000-0000-4000-8000-000000000001';
const date = '2026-10-20T10:00:00.000Z';
const preferences = ChatPreferencesSchema.parse({ mode: 'practice' });

function fixture() {
    const source = { kind: 'text' as const, id };
    let detail = ConversationDetailSchema.parse({
        conversation: {
            id,
            title: 'Private chat',
            source,
            preferences,
            version: 1,
            createdAt: date,
            updatedAt: date,
        },
        messages: [],
        drafts: [],
        turns: [],
    });
    const client = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    vi.spyOn(conversationApi, 'list').mockImplementation(async () => ({
        conversations: [detail.conversation],
    }));
    vi.spyOn(conversationApi, 'detail').mockImplementation(
        async (_token, conversationId) => ({
            ...detail,
            conversation: { ...detail.conversation, id: conversationId },
        }),
    );
    stream.submit.mockResolvedValue({
        turn: { id: 'previous-successful-turn', conversationId: id },
    });
    function Provider({ children }: PropsWithChildren) {
        return (
            <QueryClientProvider client={client}>
                <I18nProvider locale='en' messages={en}>
                    {children}
                </I18nProvider>
            </QueryClientProvider>
        );
    }
    const hook = renderHook(
        () =>
            useAssistantPanel({
                actorId: 'actor',
                source,
                folded: false,
                selectedPassage: null,
            }),
        { wrapper: Provider },
    );
    function setPreferences(
        next: typeof preferences,
        effective?: typeof preferences,
    ) {
        detail = {
            ...detail,
            conversation: {
                ...detail.conversation,
                preferences: next,
                effectivePreferences: effective,
            },
        };
        client.setQueryData(['conversation', 'actor', id], detail);
        return { conversation: detail.conversation };
    }
    return { ...hook, client, setPreferences };
}

it('retries failed defaults with the frozen preferences and never replays the previous successful tutor question', async () => {
    const { result, client } = fixture();
    await waitFor(() =>
        expect(result.current.preferences?.mode).toBe('practice'),
    );
    await act(async () => {
        await result.current.chat.submit.mutateAsync({
            content: 'Already answered question',
        });
    });
    expect(result.current.chat.submit.variables?.content).toBe(
        'Already answered question',
    );
    const save = vi
        .spyOn(conversationApi, 'saveDefaults')
        .mockRejectedValueOnce(new Error('synthetic defaults outage'))
        .mockResolvedValueOnce({ preferences });
    await act(async () => {
        await result.current.defaults();
    });
    expect(result.current.defaultsFailure?.preferences.mode).toBe('practice');
    expect(result.current.defaultsSaved).toBe(false);
    act(() => result.current.retryDefaults());
    await waitFor(() => expect(result.current.defaultsSaved).toBe(true));
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]).toEqual(['synthetic-token', preferences]);
    expect(stream.submit).toHaveBeenCalledTimes(1);
    expect(result.current.defaultsFailure).toBeNull();
    client.clear();
});

it('retries the failed mode PATCH payload and clears its error without posting another tutor turn', async () => {
    const { result, client, setPreferences } = fixture();
    await waitFor(() =>
        expect(result.current.preferences?.mode).toBe('practice'),
    );
    await act(async () => {
        await result.current.chat.submit.mutateAsync({
            content: 'A previous answered question',
        });
    });
    const next = { ...preferences, mode: 'correct' as const };
    const update = vi
        .spyOn(conversationApi, 'update')
        .mockRejectedValueOnce(new Error('synthetic preference outage'))
        .mockImplementationOnce(async (_token, _id, value) =>
            setPreferences(value),
        );
    await act(async () => {
        await result.current.updatePreferences(next);
    });
    await waitFor(() =>
        expect(result.current.chat.actionFailure?.kind).toBe('preferences'),
    );
    expect(result.current.preferences?.mode).toBe('practice');
    act(() => result.current.chat.retryAction());
    await waitFor(() =>
        expect(result.current.preferences?.mode).toBe('correct'),
    );
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[1]).toEqual([
        'synthetic-token',
        id,
        next,
        undefined,
    ]);
    expect(result.current.chat.actionError).toBe(false);
    expect(stream.submit).toHaveBeenCalledTimes(1);
    client.clear();
});

it('invalidates failed defaults after confirmed preferences change or a new change attempt', async () => {
    const { result, client, setPreferences } = fixture();
    await waitFor(() =>
        expect(result.current.preferences?.mode).toBe('practice'),
    );
    const defaults = vi
        .spyOn(conversationApi, 'saveDefaults')
        .mockRejectedValue(new Error('synthetic defaults outage'));
    await act(async () => {
        await result.current.defaults();
    });
    expect(result.current.defaultsFailure).not.toBeNull();
    act(() => {
        setPreferences({ ...preferences, mode: 'explain' });
    });
    await waitFor(() => expect(result.current.defaultsFailure).toBeNull());
    act(() => result.current.retryDefaults());
    expect(defaults).toHaveBeenCalledTimes(1);
    await act(async () => {
        await result.current.defaults();
    });
    expect(result.current.defaultsFailure?.preferences.mode).toBe('explain');
    vi.spyOn(conversationApi, 'update').mockRejectedValue(
        new Error('synthetic preference outage'),
    );
    act(() =>
        result.current.updatePreferences({ ...preferences, mode: 'correct' }),
    );
    expect(result.current.defaultsFailure).toBeNull();
    act(() => result.current.retryDefaults());
    await waitFor(() =>
        expect(result.current.chat.preferencesPending).toBe(false),
    );
    expect(defaults).toHaveBeenCalledTimes(2);
    expect(stream.submit).not.toHaveBeenCalled();
    client.clear();
});

it('clears preference and defaults retry operations when navigating to another conversation', async () => {
    const { result, client } = fixture();
    const otherId = '00000000-0000-4000-8000-000000000002';
    await waitFor(() => expect(result.current.preferences).toBeDefined());
    const update = vi
        .spyOn(conversationApi, 'update')
        .mockRejectedValue(new Error('synthetic preference outage'));
    await act(async () => {
        await result.current.chat.updatePreferences({
            ...preferences,
            mode: 'correct',
        });
    });
    const defaults = vi
        .spyOn(conversationApi, 'saveDefaults')
        .mockRejectedValue(new Error('synthetic defaults outage'));
    await act(async () => {
        await result.current.defaults();
    });
    expect(result.current.chat.actionFailure?.kind).toBe('preferences');
    expect(result.current.defaultsFailure).not.toBeNull();
    act(() => result.current.chat.select(otherId));
    await waitFor(() =>
        expect(result.current.detail?.conversation.id).toBe(otherId),
    );
    expect(result.current.chat.actionError).toBe(false);
    expect(result.current.defaultsFailure).toBeNull();
    act(() => result.current.chat.select(id));
    await waitFor(() =>
        expect(result.current.detail?.conversation.id).toBe(id),
    );
    act(() => {
        result.current.chat.retryAction();
        result.current.retryDefaults();
    });
    expect(update).toHaveBeenCalledTimes(1);
    expect(defaults).toHaveBeenCalledTimes(1);
    expect(stream.submit).not.toHaveBeenCalled();
    client.clear();
});

it('displays effective portrait values while saving only the changed manual field', async () => {
    const { result, client, setPreferences } = fixture();
    await waitFor(() => expect(result.current.preferences).toBeDefined());
    const manual = ChatPreferencesSchema.parse({
        mode: 'practice',
        replyLanguage: 'en',
        tone: 'academic',
        detail: 'concise',
        wording: 'academic',
        approach: 'theory-first',
        portrait: {
            enabled: true,
            inheritedFields: [
                'replyLanguage',
                'tone',
                'detail',
                'wording',
                'approach',
            ],
        },
    });
    const effective = ChatPreferencesSchema.parse({
        ...manual,
        replyLanguage: 'es',
        tone: 'conversational',
        detail: 'detailed',
        wording: 'simple',
        approach: 'examples-first',
    });
    act(() => {
        setPreferences(manual, effective);
    });
    await waitFor(() =>
        expect(result.current.preferences?.replyLanguage).toBe('es'),
    );
    const update = vi
        .spyOn(conversationApi, 'update')
        .mockImplementation(async (_token, _id, next) => setPreferences(next));
    act(() =>
        result.current.updatePreferences({ ...effective, wording: 'balanced' }),
    );
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0]?.[2]).toMatchObject({
        mode: 'practice',
        replyLanguage: 'en',
        tone: 'academic',
        detail: 'concise',
        wording: 'balanced',
        approach: 'theory-first',
    });
    expect(update.mock.calls[0]?.[2].portrait?.inheritedFields).toEqual([
        'replyLanguage',
        'tone',
        'detail',
        'approach',
    ]);
    client.clear();
});

it('creates a fresh excluded chat in the first request while keeping manual settings', async () => {
    const { result, client, setPreferences } = fixture();
    await waitFor(() => expect(result.current.preferences).toBeDefined());
    const manual = ChatPreferencesSchema.parse({
        mode: 'correct',
        replyLanguage: 'en',
        tone: 'academic',
        portrait: { enabled: true, inheritedFields: ['tone'] },
    });
    act(() => {
        setPreferences(manual, { ...manual, tone: 'conversational' });
    });
    await waitFor(() =>
        expect(result.current.preferences?.mode).toBe('correct'),
    );
    const create = vi
        .spyOn(conversationApi, 'create')
        .mockResolvedValue(setPreferences(manual));
    act(() => result.current.createWithoutPortrait());
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(create.mock.calls[0]?.[3]).toMatchObject({
        mode: 'correct',
        replyLanguage: 'en',
        tone: 'academic',
        portrait: { enabled: false, inheritedFields: ['tone'] },
    });
    client.clear();
});
