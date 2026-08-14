import { act, render, screen, waitFor } from '@testing-library/react';
import {
    createElement,
    type Dispatch,
    type SetStateAction,
    useEffect,
} from 'react';
import { describe, expect, it, vi } from 'vitest';

import { localizedAuthError } from '@/fsd/features/auth/lib/auth-error-message';
import { AuthApiError } from '@/fsd/shared/api/auth-api';
import {
    I18nProvider,
    preferredLocale,
    useLocaleSensitiveState,
} from '@/fsd/shared/i18n';
import { en } from '@/fsd/shared/i18n/messages/en';
import { ru } from '@/fsd/shared/i18n/messages/ru';
import { createTranslator } from '@/fsd/shared/i18n/translator';

function LocaleMessageHarness({
    capture,
}: {
    capture(setMessage: Dispatch<SetStateAction<string | null>>): void;
}) {
    const [message, setMessage] = useLocaleSensitiveState<string | null>(null);
    useEffect(() => capture(setMessage), [capture, setMessage]);
    return createElement('output', null, message);
}

describe('i18n primitives', () => {
    it('prefers an allowlisted cookie and otherwise negotiates the language header', () => {
        expect(preferredLocale('ru', 'fr-FR,fr;q=0.9')).toBe('ru');
        expect(preferredLocale('de', 'fr-CA,es;q=0.8')).toBe('fr');
        expect(preferredLocale(undefined, 'en;q=0.2,fr-CA;q=0.9')).toBe('fr');
        expect(preferredLocale(undefined, 'de-DE,*;q=0.5')).toBe('en');
    });

    it('interpolates named values without evaluating message content', () => {
        const t = createTranslator(en);
        expect(t('home.signedInAs', { email: 'learner@example.com' })).toBe(
            'Signed in as learner@example.com',
        );
        expect(t('verify.resendIn')).toBe('Send a new code in {seconds}s');
    });

    it('maps transport errors through the active catalog', () => {
        const error = new AuthApiError(401, {
            code: 'invalid_credentials',
            correlationId: 'request-1',
            message: 'The email or password is incorrect.',
        });

        expect(localizedAuthError(error, createTranslator(ru))).toBe(
            'Неверный адрес почты или пароль.',
        );
    });

    it('clears locale-sensitive copy and ignores a stale async setter', async () => {
        const capture = vi.fn();
        const view = render(
            createElement(I18nProvider, {
                children: createElement(LocaleMessageHarness, { capture }),
                locale: 'en',
                messages: en,
            }),
        );
        const oldSetter = capture.mock.calls[0]?.[0];
        expect(oldSetter).toBeTypeOf('function');
        act(() => oldSetter?.('English error'));
        expect(screen.getByText('English error')).toBeVisible();

        view.rerender(
            createElement(I18nProvider, {
                children: createElement(LocaleMessageHarness, { capture }),
                locale: 'ru',
                messages: ru,
            }),
        );
        await waitFor(() =>
            expect(screen.queryByText('English error')).not.toBeInTheDocument(),
        );

        act(() => oldSetter?.('Late English error'));
        expect(
            screen.queryByText('Late English error'),
        ).not.toBeInTheDocument();
    });
});
