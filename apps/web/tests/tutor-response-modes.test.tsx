import {
    act,
    render,
    renderHook,
    screen,
    waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type PropsWithChildren } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
    ChatPreferencesSchema,
    ConversationDetailSchema,
} from '@languon/contracts';
import { conversationApi } from '../src/fsd/entities/conversation';
import { I18nProvider, type Locale } from '../src/fsd/shared/i18n';
import { en } from '../src/fsd/shared/i18n/messages/en';
import { es } from '../src/fsd/shared/i18n/messages/es';
import { fr } from '../src/fsd/shared/i18n/messages/fr';
import { ru } from '../src/fsd/shared/i18n/messages/ru';
import { TutorModeControl } from '../src/fsd/widgets/contextual-assistant/ui/contextual-assistant/tutor-mode-control';
import { WorkspaceComposerSettings } from '../src/fsd/widgets/contextual-assistant/ui/contextual-assistant/workspace-composer-settings';
import { useConversation } from '../src/fsd/widgets/contextual-assistant/hooks/use-conversation';

vi.mock(
    '../src/fsd/widgets/contextual-assistant/hooks/use-conversation-stream',
    () => ({ useConversationStream: () => ({}) }),
);
afterEach(() => vi.restoreAllMocks());
const preferences = ChatPreferencesSchema.parse({
    tone: 'academic',
    replyLanguage: 'es',
    explanationLevel: 'detailed',
});
const catalogs = { en, es, fr, ru };
function wrapper(locale: Locale = 'en') {
    return function Provider({ children }: PropsWithChildren) {
        return (
            <I18nProvider locale={locale} messages={catalogs[locale]}>
                {children}
            </I18nProvider>
        );
    };
}

it('submits a mode preference without losing language, tone or level and reflects only confirmed values', async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    const view = render(
        <TutorModeControl
            value={preferences}
            onChange={change}
            disabled={false}
        />,
        { wrapper: wrapper() },
    );
    expect(screen.getByRole('radiogroup', { name: 'Mode' })).toBeVisible();
    await user.click(
        screen.getByRole('radio', { name: 'Correct', exact: true }),
    );
    expect(change).toHaveBeenCalledWith({ ...preferences, mode: 'correct' });
    expect(
        screen.getByRole('radio', { name: 'Auto', exact: true }),
    ).toBeChecked();
    view.rerender(
        <TutorModeControl
            value={{ ...preferences, mode: 'correct' }}
            onChange={change}
            disabled={true}
        />,
    );
    expect(
        screen.getByRole('radio', { name: 'Correct', exact: true }),
    ).toBeChecked();
    await user.click(
        screen.getByRole('radio', { name: 'Practice', exact: true }),
    );
    expect(change).toHaveBeenCalledTimes(1);
});

it.each([
    ['en', 'Mode', ['Auto', 'Explain', 'Correct', 'Practice']],
    ['ru', 'Режим', ['Авто', 'Объяснение', 'Проверка', 'Практика']],
    ['es', 'Modo', ['Automático', 'Explicar', 'Corregir', 'Practicar']],
    ['fr', 'Mode', ['Auto', 'Expliquer', 'Corriger', 'Pratiquer']],
] as const)('labels the native mode group in %s', (locale, label, options) => {
    render(
        <TutorModeControl
            value={preferences}
            onChange={vi.fn()}
            disabled={false}
        />,
        { wrapper: wrapper(locale) },
    );
    expect(screen.getByRole('radiogroup', { name: label })).toBeVisible();
    for (const name of options)
        expect(screen.getByRole('radio', { name, exact: true })).toBeVisible();
});

it('uses the real defaults callback and does not claim success before the caller confirms persistence', async () => {
    const user = userEvent.setup();
    const defaults = vi.fn();
    const props = {
        value: { ...preferences, mode: 'practice' as const },
        onChange: vi.fn(),
        onDefaults: defaults,
        disabled: false,
        defaultsSaved: false,
        languageOptions: [{ value: 'es', label: 'Spanish' }],
        tones: [],
        levels: [],
    };
    const view = render(<WorkspaceComposerSettings {...props} />, {
        wrapper: wrapper(),
    });
    await user.click(screen.getByRole('button', { name: 'Response settings' }));
    expect(
        screen.getByRole('radio', { name: 'Practice', exact: true }),
    ).toBeChecked();
    await user.click(
        screen.getByRole('button', { name: 'Use as my defaults' }),
    );
    expect(defaults).toHaveBeenCalledOnce();
    expect(screen.queryByRole('status')).toBeNull();
    view.rerender(<WorkspaceComposerSettings {...props} defaultsSaved />);
    expect(screen.getByRole('status')).toBeVisible();
});

it('locks concurrent preference writes, retains the last confirmed mode on failure and recovers on retry', async () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const date = '2026-10-20T10:00:00.000Z';
    const source = { kind: 'knowledge' as const, id };
    let saved = ConversationDetailSchema.parse({
        conversation: {
            id,
            title: 'Study note',
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
    vi.spyOn(conversationApi, 'list').mockImplementation(async () => ({
        conversations: [saved.conversation],
    }));
    vi.spyOn(conversationApi, 'detail').mockImplementation(async () => saved);
    let reject!: (reason: Error) => void;
    const update = vi.spyOn(conversationApi, 'update').mockImplementationOnce(
        () =>
            new Promise((_, fail) => {
                reject = fail;
            }),
    );
    const client = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    function Provider({ children }: PropsWithChildren) {
        return (
            <QueryClientProvider client={client}>
                {children}
            </QueryClientProvider>
        );
    }
    const request = <T,>(operation: (token: string) => Promise<T>) =>
        operation('synthetic-token');
    const { result } = renderHook(
        () => useConversation('actor', source, request),
        { wrapper: Provider },
    );
    await waitFor(() => expect(result.current.detail.isSuccess).toBe(true));
    let pending!: Promise<void>;
    act(() => {
        pending = result.current.updatePreferences({
            ...preferences,
            mode: 'correct',
        });
    });
    expect(result.current.preferencesPending).toBe(true);
    await act(async () => {
        await result.current.updatePreferences({
            ...preferences,
            mode: 'practice',
        });
    });
    expect(update).toHaveBeenCalledTimes(1);
    await act(async () => {
        reject(new Error('synthetic unavailable'));
        await pending;
    });
    expect(result.current.actionError).toBe(true);
    expect(result.current.preferencesPending).toBe(false);
    expect(result.current.detail.data?.conversation.preferences.mode).toBe(
        'auto',
    );
    update.mockImplementation(async (_token, _id, next) => {
        saved = {
            ...saved,
            conversation: { ...saved.conversation, preferences: next },
        };
        return { conversation: saved.conversation };
    });
    await act(async () => {
        await result.current.updatePreferences({
            ...preferences,
            mode: 'explain',
        });
    });
    await waitFor(() =>
        expect(result.current.detail.data?.conversation.preferences.mode).toBe(
            'explain',
        ),
    );
    expect(result.current.actionError).toBe(false);
    client.clear();
});

it('keeps the settings popover and focused radio stable throughout a pending preference save', async () => {
    const user = userEvent.setup();
    let complete!: () => void;
    const changed = vi.fn();
    function Settings() {
        const [value, setValue] = useState(preferences);
        const [pending, setPending] = useState(false);
        function change(next: typeof preferences) {
            changed(next);
            setPending(true);
            complete = () => {
                setValue(next);
                setPending(false);
            };
        }
        return (
            <WorkspaceComposerSettings
                value={value}
                onChange={change}
                onDefaults={vi.fn()}
                disabled={pending}
                defaultsSaved={false}
                languageOptions={[{ value: 'es', label: 'Spanish' }]}
                tones={[]}
                levels={[]}
            />
        );
    }
    render(<Settings />, { wrapper: wrapper() });
    await user.click(screen.getByRole('button', { name: 'Response settings' }));
    const practice = screen.getByRole('radio', {
        name: 'Practice',
        exact: true,
    });
    await user.click(practice);
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(practice).toHaveFocus();
    expect(practice).toHaveAttribute('aria-disabled', 'true');
    expect(practice).not.toBeDisabled();
    await user.keyboard(' ');
    expect(changed).toHaveBeenCalledTimes(1);
    act(() => complete());
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(practice).toBeChecked();
    expect(practice).toHaveFocus();
});
