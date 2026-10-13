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
    it('shows the exact whole-text price, balance, provisional status and success-only billing before confirming', () => {
        const confirm = vi.fn();
        const cancel = vi.fn();
        render(
            <SpeechConfirmation
                quote={quote}
                onConfirm={confirm}
                onCancel={cancel}
            />,
        );
        expect(screen.getByText('11 credits')).toBeVisible();
        expect(screen.getByText('Available credits: 100')).toBeVisible();
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
        expect(screen.getByText('Available credits: Unlimited')).toBeVisible();
        expect(
            screen.getByRole('button', { name: 'Generate', exact: true }),
        ).toBeEnabled();
    });
});
