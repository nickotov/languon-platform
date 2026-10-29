import { useState } from 'react';
import { Check, Copy, NotebookPen } from 'lucide-react';
import { conversationCopy } from '@/fsd/entities/conversation';
import { useI18n } from '@/fsd/shared/i18n';
import { messagesCopy } from '../../lib/messages-copy';
import styles from './conversation-messages.module.css';

export function ResponseActions({
    text,
    onPropose,
    canPropose,
    disabled,
}: {
    text: string;
    onPropose?: (() => void) | undefined;
    canPropose: boolean;
    disabled: boolean;
}) {
    const { locale } = useI18n();
    const copy = conversationCopy(locale);
    const labels = messagesCopy(locale);
    const [copied, setCopied] = useState(false);
    const [copyError, setCopyError] = useState(false);
    const showPropose = canPropose && onPropose !== undefined;
    const copyLabel = copied ? labels.copied : labels.copy;
    async function copyAnswer() {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setCopyError(false);
        } catch {
            setCopyError(true);
        }
    }
    return (
        <>
            <button type='button' className={styles.quiet} onClick={copyAnswer}>
                {copied ? (
                    <Check size={14} aria-hidden='true' />
                ) : (
                    <Copy size={14} aria-hidden='true' />
                )}
                {copyLabel}
            </button>
            {showPropose && (
                <button
                    type='button'
                    className={styles.quiet}
                    onClick={onPropose}
                    disabled={disabled}
                >
                    <NotebookPen size={14} aria-hidden='true' />
                    {copy.propose}
                </button>
            )}
            {copyError && (
                <p role='status' className={styles.notice}>
                    {labels.copyFailed}
                </p>
            )}
        </>
    );
}
