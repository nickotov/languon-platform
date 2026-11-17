import { useEffect, useState } from 'react';
import type { ConversationActionQuote } from '@languon/contracts';
import { Button, Dialog, DialogActions, InlineAlert } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import { lessonRunCopy } from '../../lib/lesson-run-copy';

export function LessonRunQuote({
    quote,
    busy,
    revision = false,
    onConfirm,
    onRefresh,
    onClose,
}: {
    quote: ConversationActionQuote | null;
    busy: boolean;
    revision?: boolean;
    onConfirm(): void;
    onRefresh(): void;
    onClose(): void;
}) {
    const { locale } = useI18n();
    const copy = lessonRunCopy(locale);
    const [now, setNow] = useState(Date.now);
    useEffect(() => {
        if (!quote) {
            return;
        }

        setNow(Date.now());
        const timer = window.setInterval(() => setNow(Date.now()), 1000);

        return () => window.clearInterval(timer);
    }, [quote]);

    const expired = quote !== null && Date.parse(quote.expiresAt) <= now;
    const expiry = quote
        ? new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(
              new Date(quote.expiresAt),
          )
        : '';
    const confirm = expired ? onRefresh : onConfirm;
    let label = revision ? copy.adjust : copy.continue;
    if (expired) {
        label = copy.refreshQuote;
    }

    return (
        <Dialog
            open={quote !== null}
            onClose={onClose}
            closeLabel={copy.cancel}
            title={revision ? copy.quoteRevisionTitle : copy.quoteTitle}
            description={
                revision ? copy.quoteRevisionDescription : copy.quoteDescription
            }
            footer={
                <DialogActions>
                    <Button
                        variant='secondary'
                        onClick={onClose}
                        disabled={busy}
                    >
                        {copy.cancel}
                    </Button>
                    <Button onClick={confirm} loading={busy}>
                        {label}
                    </Button>
                </DialogActions>
            }
        >
            {quote && (
                <>
                    <p>
                        {copy.maximum}: <strong>{quote.maximumCredits}</strong>
                    </p>
                    <p>
                        {copy.expires}: {expiry}
                    </p>
                </>
            )}
            {expired && (
                <InlineAlert tone='warning'>{copy.quoteExpired}</InlineAlert>
            )}
        </Dialog>
    );
}
