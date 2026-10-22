import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { parseCreditMilli, type SpeechQuote } from '@languon/contracts';
import { compactCreditAmount } from '@/fsd/shared/lib/credit-amount';
import { Button, Dialog, InlineAlert } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import { speechCopy } from '../../lib/copy';

export function SpeechConfirmation({
    quote,
    onConfirm,
    onCancel,
}: {
    quote: SpeechQuote;
    onConfirm(): void;
    onCancel(): void;
}) {
    const { locale, t } = useI18n();
    const copy = speechCopy[locale];
    const [expired, setExpired] = useState(
        Date.parse(quote.expiresAt) <= Date.now(),
    );
    useEffect(() => {
        const timer = setTimeout(
            () => setExpired(true),
            Math.max(0, Date.parse(quote.expiresAt) - Date.now()),
        );
        return () => clearTimeout(timer);
    }, [quote.expiresAt]);
    const insufficient =
        !quote.unlimited &&
        parseCreditMilli(quote.availableCredits) <
            parseCreditMilli(quote.credits);
    const amount = compactCreditAmount(quote.credits, locale);
    const balance = quote.unlimited
        ? copy.unlimited
        : compactCreditAmount(quote.availableCredits, locale);
    const footer = (
        <>
            <Button variant='secondary' onClick={onCancel}>
                {copy.cancel}
            </Button>
            <Button onClick={onConfirm} disabled={insufficient || expired}>
                {copy.confirm}
            </Button>
        </>
    );
    if (typeof document === 'undefined') return null;
    return createPortal(
        <Dialog
            open
            title={copy.title}
            onClose={onCancel}
            closeLabel={t('dictionary.dialog.close')}
            footer={footer}
        >
            <p>
                <strong>
                    {amount} {copy.cost}
                </strong>
            </p>
            <p>
                {copy.balance}: {balance}
            </p>
            <details>
                <summary>{copy.exact}</summary>
                <p>
                    {quote.credits} {copy.cost}
                </p>
                <p>
                    {copy.balance}:{' '}
                    {quote.unlimited ? copy.unlimited : quote.availableCredits}
                </p>
            </details>
            {quote.provisional ? <p>{copy.provisional}</p> : null}
            <p>{copy.disclaimer}</p>
            <p>{copy.expires}</p>
            {insufficient ? (
                <InlineAlert tone='warning'>{copy.insufficient}</InlineAlert>
            ) : null}
            {expired ? (
                <InlineAlert tone='warning'>{copy.expires}</InlineAlert>
            ) : null}
        </Dialog>,
        document.body,
    );
}
