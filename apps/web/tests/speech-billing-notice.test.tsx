import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpeechResponse, SpeechSource } from '@languon/contracts';
import { useSessionStore } from '@/fsd/entities/session';
import { clearToasts, ToastHost } from '@/fsd/shared/ui';
import { useSpeechControl } from '@/fsd/features/speech-playback/hooks/use-speech-control';
import { speechPlayer } from '@/fsd/features/speech-playback/model/speech-player';
import { render } from './render';

const transport = vi.hoisted(() => ({
    prepare: vi.fn(),
    confirm: vi.fn(),
    status: vi.fn(),
    bytes: vi.fn(),
    availability: vi.fn(),
}));
vi.mock('@/fsd/features/speech-playback/api/speech-api', () => ({
    speechApi: () => transport,
}));
vi.mock('@/fsd/features/speech-playback/api/speech-availability', () => ({
    speechAvailability: async () => true,
}));

const source: SpeechSource = {
    kind: 'dictionary-field',
    access: {
        kind: 'owner',
        dictionaryId: '00000000-0000-4000-8000-000000000001',
    },
    cardId: '00000000-0000-4000-8000-000000000002',
    field: 'source',
};
const completed: SpeechResponse = {
    state: 'ready',
    requestId: '00000000-0000-4000-8000-000000000003',
    playbackId: '00000000-0000-4000-8000-000000000003',
    quote: null,
    fixture: false,
    retryAfterMs: null,
    error: null,
    billingState: 'charged_success',
};

function Control() {
    const control = useSpeechControl(source, (callback) =>
        callback('test-token'),
    );
    return (
        <>
            <button onClick={control.play}>Play</button>
            <ToastHost label='Notifications' />
        </>
    );
}
function control(locale: 'en' | 'ru' | 'fr' | 'es' = 'en') {
    return render(
        <QueryClientProvider client={new QueryClient()}>
            <Control />
        </QueryClientProvider>,
        { locale },
    );
}

beforeEach(() => {
    useSessionStore.setState({
        status: 'authenticated',
        user: {
            id: '00000000-0000-4000-8000-000000000001',
            primaryEmail: 'synthetic@example.test',
            createdAt: new Date(0).toISOString(),
            emailVerified: true,
            status: 'active',
            handle: null,
        },
    });
    transport.prepare.mockReset().mockResolvedValue(completed);
    transport.bytes
        .mockReset()
        .mockResolvedValue(new Blob(['tone'], { type: 'audio/wav' }));
    vi.stubGlobal(
        'Audio',
        class {
            onended = null;
            onerror = null;
            play = vi.fn().mockResolvedValue(undefined);
            pause = vi.fn();
            load = vi.fn();
            removeAttribute = vi.fn();
        },
    );
    vi.stubGlobal(
        'URL',
        Object.assign(URL, {
            createObjectURL: vi.fn(() => 'blob:test'),
            revokeObjectURL: vi.fn(),
        }),
    );
});
afterEach(() => {
    cleanup();
    speechPlayer.reset();
    clearToasts();
    useSessionStore.getState().signOut();
    vi.unstubAllGlobals();
});

describe('speech billing notices', () => {
    it.each([
        ['en', 'Pronunciation generated.'],
        ['ru', 'Произношение создано.'],
        ['fr', 'Prononciation générée.'],
        ['es', 'Pronunciación generada.'],
    ] as const)(
        'uses a human completion label in %s, including unmetered completions',
        async (locale, label) => {
            control(locale);
            fireEvent.click(
                screen.getByRole('button', { name: 'Play', exact: true }),
            );
            await expect(screen.findByText(label)).resolves.toBeVisible();
            expect(
                screen.queryByText('charged_success'),
            ).not.toBeInTheDocument();
        },
    );
    it('reports released generation without claiming the learner was charged', async () => {
        transport.prepare.mockResolvedValue({
            ...completed,
            state: 'failed',
            playbackId: null,
            billingState: 'released_no_charge',
        });
        control();
        fireEvent.click(
            screen.getByRole('button', { name: 'Play', exact: true }),
        );
        await expect(
            screen.findByText('Pronunciation was not charged.'),
        ).resolves.toBeVisible();
        expect(
            screen.queryByText('released_no_charge'),
        ).not.toBeInTheDocument();
    });
    it('does not generate a billing event or notice for cached playback', async () => {
        transport.prepare.mockResolvedValue({
            ...completed,
            billingState: 'free',
        });
        control();
        fireEvent.click(
            screen.getByRole('button', { name: 'Play', exact: true }),
        );
        await waitFor(() => expect(transport.bytes).toHaveBeenCalledOnce());
        expect(
            screen.queryByText('Pronunciation generated.'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByText('Pronunciation was not charged.'),
        ).not.toBeInTheDocument();
    });
});
