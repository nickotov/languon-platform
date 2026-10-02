import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrainingLauncher } from '@/fsd/features/flashcard-training';
import { I18nProvider } from '@/fsd/shared/i18n';
import { en } from '@/fsd/shared/i18n/messages/en';

afterEach(() => vi.unstubAllGlobals());

describe('training launcher capability-gated cards', () => {
    it('keeps Train and coming-soon Sentences while omitting disabled-capability Cards', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ flashcardsEnabled: false }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }),
        );
        vi.stubGlobal('fetch', fetchMock);
        const requestWithSession = vi.fn();
        render(
            <I18nProvider locale='en' messages={en}>
                <TrainingLauncher
                    target={{
                        kind: 'owner',
                        dictionaryId: '10000000-0000-4000-8000-000000000001',
                    }}
                    requestWithSession={requestWithSession}
                    signedIn
                    identity='learner'
                    dictionaryTitle='Everyday Spanish'
                    sourceLanguage={{
                        code: 'es',
                        name: 'Spanish',
                        direction: 'ltr',
                    }}
                    targetLanguage={{
                        code: 'en',
                        name: 'English',
                        direction: 'ltr',
                    }}
                    activeCount={2}
                />
            </I18nProvider>,
        );
        const trigger = screen.getByRole('button', { name: 'Train' });
        expect(trigger).toBeEnabled();
        fireEvent.click(trigger);
        await waitFor(() =>
            expect(
                screen.queryByRole('menuitem', {
                    name: 'Checking availability…',
                }),
            ).not.toBeInTheDocument(),
        );
        expect(screen.getByRole('button', { name: 'Train' })).toBeEnabled();
        expect(
            screen.getByRole('menuitem', { name: 'Sentences Coming soon' }),
        ).toBeDisabled();
        expect(screen.getAllByRole('menuitem')).toHaveLength(1);
        expect(
            screen.queryByRole('menuitem', { name: 'Cards' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('dialog', { name: 'Train with cards' }),
        ).not.toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalledOnce();
        expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(
            /\/learning\/capabilities$/,
        );
        expect(requestWithSession).not.toHaveBeenCalled();
    });
});
