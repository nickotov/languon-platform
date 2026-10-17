import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { SpeechSource } from '@languon/contracts';
import { SpeechControl } from '@/fsd/features/speech-playback/ui/speech-control/speech-control';
import { useSpeechControl } from '@/fsd/features/speech-playback/hooks/use-speech-control';
import { render } from './render';
import { speechCopy } from '@/fsd/features/speech-playback/lib/copy';

vi.mock('@/fsd/features/speech-playback/hooks/use-speech-control', () => ({
    useSpeechControl: vi.fn(),
}));

const source: SpeechSource = {
    kind: 'dictionary-field',
    access: { kind: 'owner' },
    cardId: '00000000-0000-4000-8000-000000000001',
    expectedVersion: 1,
    expectedDictionaryVersion: 1,
    expectedSettingsVersion: 1,
    field: 'source',
};
const play = vi.fn();
const stop = vi.fn();

function control(
    phase: ReturnType<typeof useSpeechControl>['state']['phase'],
    fixture = false,
    error: string | null = null,
    locale: 'en' | 'ru' | 'fr' | 'es' = 'en',
) {
    vi.mocked(useSpeechControl).mockReturnValue({
        available: true,
        selected: true,
        state: { selection: 'selected', phase, fixture, error },
        play,
        stop,
        confirm: vi.fn(),
    });
    return render(
        <SpeechControl
            source={source}
            requestWithSession={vi.fn()}
            fieldLabel='Source phrase'
        />,
        { locale },
    );
}

beforeEach(() => vi.clearAllMocks());

it('shows only an icon while retaining an action label and keyboard tooltip', async () => {
    control('idle');
    const button = screen.getByRole('button', { name: 'Play Source phrase' });
    expect(button).toHaveTextContent('');
    fireEvent.focus(button);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
        'Play Source phrase',
    );
    fireEvent.click(button);
    expect(play).toHaveBeenCalledOnce();
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

it('keeps retry instructions in a tooltip and announces failures without inline text', async () => {
    control('failed');
    const button = screen.getByRole('button', { name: 'Play Source phrase' });
    expect(button).toHaveTextContent('');
    expect(screen.getByRole('status')).toHaveTextContent(
        'Pronunciation could not be prepared. Try again.',
    );
    fireEvent.focus(button);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
        'Pronunciation could not be prepared. Try again.',
    );
});

it.each(['en', 'ru', 'fr', 'es'] as const)(
    'localizes provider failure in the %s tooltip and live announcement',
    async (locale) => {
        control('failed', false, 'speech_provider_unavailable', locale);
        const button = screen.getByRole('button');
        expect(button).toHaveTextContent('');
        expect(screen.getByRole('status')).toHaveTextContent(
            speechCopy[locale].providerUnavailable,
        );
        fireEvent.focus(button);
        expect(await screen.findByRole('tooltip')).toHaveTextContent(
            speechCopy[locale].providerUnavailable,
        );
    },
);

it('shows a loading spinner and keeps cancellation available through an icon', () => {
    control('loading');
    const loading = screen.getByRole('button', { name: 'Play Source phrase' });
    expect(loading).toHaveAttribute('aria-busy', 'true');
    expect(loading).toBeDisabled();
    const cancel = screen.getByRole('button', { name: 'Stop waiting' });
    expect(cancel).toHaveTextContent('');
    fireEvent.click(cancel);
    expect(stop).toHaveBeenCalledOnce();
});

it('switches to an icon-only stop action while playing', () => {
    control('playing');
    const button = screen.getByRole('button', { name: 'Stop Source phrase' });
    expect(button).toHaveTextContent('');
    fireEvent.click(button);
    expect(stop).toHaveBeenCalledOnce();
});

it('keeps the test tone disclosure in the ready tooltip and live announcement', async () => {
    control('ready', true);
    const button = screen.getByRole('button', { name: 'Play Source phrase' });
    fireEvent.focus(button);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
        'Development test tone',
    );
    expect(screen.getByRole('status')).toHaveTextContent(
        'Development test tone',
    );
});
