import {
    AlertCircleIcon,
    CheckIcon,
    ClockIcon,
    RefreshCwIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './user-message.module.css';
export type UserMessageStatus = 'sending' | 'sent' | 'error';
export interface UserMessageProps {
    children?: ReactNode;
    text?: string;
    status?: UserMessageStatus;
    timestamp?: string;
    translation?: string;
    onRetry?: () => void;
    className?: string;
}
const labels = { sending: 'Sending', sent: 'Sent', error: 'Not delivered' };
export function UserMessage({
    children,
    text,
    status = 'sent',
    timestamp,
    translation,
    onRetry,
    className,
}: UserMessageProps) {
    const Icon =
        status === 'sending'
            ? ClockIcon
            : status === 'sent'
              ? CheckIcon
              : AlertCircleIcon;
    return (
        <div
            role='listitem'
            aria-label='Your message'
            className={[styles.root, className].filter(Boolean).join(' ')}
        >
            <div
                className={[
                    styles.bubble,
                    status === 'error' ? styles.error : '',
                    status === 'sending' ? styles.sending : '',
                ]
                    .filter(Boolean)
                    .join(' ')}
            >
                <p>{children ?? text}</p>
                {translation ? (
                    <p className={styles.translation}>{translation}</p>
                ) : null}
            </div>
            <div className={styles.meta}>
                {timestamp ? <span>{timestamp}</span> : null}
                <Icon
                    className={status === 'error' ? styles.errorIcon : ''}
                    aria-hidden='true'
                />
                <span className={styles.sr}>{labels[status]}</span>
                {status === 'error' && onRetry ? (
                    <button type='button' onClick={onRetry}>
                        <RefreshCwIcon aria-hidden='true' />
                        Retry
                    </button>
                ) : null}
            </div>
        </div>
    );
}
