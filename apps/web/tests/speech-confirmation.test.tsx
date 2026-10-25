import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SpeechQuote } from '@languon/contracts';
import { SpeechConfirmation } from '@/fsd/features/speech-playback/ui/speech-confirmation/speech-confirmation';
import { render } from './render';

const quote: SpeechQuote = {
    id: '00000000-0000-4000-8000-000000000004',
    credits: '11',
    availableCredits: '100',
    unlimited: false,
    wordCount: 11,
    characterCount: 110,
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    provisional: true,
};
describe('speech cost confirmation', () => {
    it('shows the exact whole-text price, provisional status and success-only billing before confirming', () => {
        const confirm = vi.fn();
        const cancel = vi.fn();
        render(
            <SpeechConfirmation
                quote={quote}
                onConfirm={confirm}
                onCancel={cancel}
            />,
        );
        expect(
            screen.getByText('11 credits', { selector: 'strong' }),
        ).toBeVisible();
        expect(
            screen.queryByText(/Available credits:/),
        ).not.toBeInTheDocument();
        expect(screen.getByText('Provisional price')).toBeVisible();
        expect(
            screen.getByText(/charged only if audio is saved successfully/),
        ).toBeVisible();
        expect(confirm).not.toHaveBeenCalled();
        fireEvent.click(
            screen.getByRole('button', { name: 'Generate', exact: true }),
        );
        expect(confirm).toHaveBeenCalledOnce();
    });
    it('prevents admission with insufficient credits and cancellation only closes the dialog', () => {
        const confirm = vi.fn();
        const cancel = vi.fn();
        render(
            <SpeechConfirmation
                quote={{ ...quote, availableCredits: '10' }}
                onConfirm={confirm}
                onCancel={cancel}
            />,
        );
        expect(
            screen.getByRole('button', { name: 'Generate', exact: true }),
        ).toBeDisabled();
        expect(screen.getByText('Not enough credits.')).toBeVisible();
        fireEvent.click(
            screen.getByRole('button', { name: 'Cancel', exact: true }),
        );
        expect(cancel).toHaveBeenCalledOnce();
        expect(confirm).not.toHaveBeenCalled();
    });
    it('shows the billing disclaimer in the selected interface language', () => {
        render(
            <SpeechConfirmation
                quote={quote}
                onConfirm={vi.fn()}
                onCancel={vi.fn()}
            />,
            { locale: 'ru' },
        );
        expect(
            screen.getByRole('dialog', { name: 'Создать произношение?' }),
        ).toBeVisible();
        expect(
            screen.getByText(
                /Кредиты списываются только после успешного сохранения аудио/,
            ),
        ).toBeVisible();
    });
    it('permits an unlimited account without a finite balance', () => {
        render(
            <SpeechConfirmation
                quote={{ ...quote, availableCredits: '0', unlimited: true }}
                onConfirm={vi.fn()}
                onCancel={vi.fn()}
            />,
        );
        expect(
            screen.queryByText(/Available credits:/),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Generate', exact: true }),
        ).toBeEnabled();
    });
});

describe('decimal speech credit quotes', () => {
    it('rounds only presentation and rejects a balance short by one milli-credit', () => {
        render(
            <SpeechConfirmation
                quote={{
                    ...quote,
                    credits: '0.125',
                    availableCredits: '0.124',
                }}
                onConfirm={vi.fn()}
                onCancel={vi.fn()}
            />,
        );
        expect(screen.getByText('0.13 credits')).toBeVisible();
        expect(
            screen.queryByText(/Available credits:/),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Generate', exact: true }),
        ).toBeDisabled();
        fireEvent.click(screen.getByText('Exact values'));
        expect(screen.getByText('0.125 credits')).toBeVisible();
    });
    it('never presents a nonzero tiny price as free and permits an equal exact balance', () => {
        render(
            <SpeechConfirmation
                quote={{
                    ...quote,
                    credits: '0.001',
                    availableCredits: '0.001',
                }}
                onConfirm={vi.fn()}
                onCancel={vi.fn()}
            />,
        );
        expect(screen.getByText('<0.01 credits')).toBeVisible();
        expect(
            screen.getByRole('button', { name: 'Generate', exact: true }),
        ).toBeEnabled();
        fireEvent.click(screen.getByText('Exact values'));
        expect(screen.getByText('0.001 credits')).toBeVisible();
    });
});
