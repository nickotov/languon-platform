import {
    AlertCircleIcon,
    GraduationCapIcon,
    LanguagesIcon,
    RotateCcwIcon,
    Volume2Icon,
} from 'lucide-react';
import styles from './ai-tutor-message.module.css';
export type AiTutorMessageStatus = 'idle' | 'typing' | 'error';
export interface AiTutorMessageProps {
    message?: string;
    tutorName?: string;
    avatarUrl?: string;
    timestamp?: string;
    translation?: string;
    status?: AiTutorMessageStatus;
    onPlayAudio?: () => void;
    onToggleTranslation?: () => void;
    translationVisible?: boolean;
    onRetry?: () => void;
    className?: string;
}
export function AiTutorMessage({
    message,
    tutorName = 'Tutor',
    avatarUrl,
    timestamp,
    translation,
    status = 'idle',
    onPlayAudio,
    onToggleTranslation,
    translationVisible = false,
    onRetry,
    className,
}: AiTutorMessageProps) {
    const error = status === 'error',
        typing = status === 'typing';
    return (
        <article
            aria-label={`Message from ${tutorName}`}
            aria-live={typing ? 'polite' : undefined}
            className={[styles.root, className].filter(Boolean).join(' ')}
        >
            {avatarUrl ? (
                <img className={styles.avatar} src={avatarUrl} alt='' />
            ) : (
                <span className={styles.avatarFallback} aria-hidden='true'>
                    <GraduationCapIcon />
                </span>
            )}
            <div className={styles.column}>
                <div className={styles.meta}>
                    <span>{tutorName}</span>
                    {timestamp ? <time>{timestamp}</time> : null}
                </div>
                <div
                    className={[styles.bubble, error ? styles.error : '']
                        .filter(Boolean)
                        .join(' ')}
                >
                    {typing ? (
                        <span className={styles.typing} role='status'>
                            <span className={styles.sr}>
                                {tutorName} is typing
                            </span>
                            <i />
                            <i />
                            <i />
                        </span>
                    ) : error ? (
                        <p className={styles.errorBody}>
                            <AlertCircleIcon aria-hidden='true' />
                            {message ??
                                "Couldn't reach your tutor. Check your connection and try again."}
                        </p>
                    ) : (
                        <p className={styles.message}>{message}</p>
                    )}
                    {!typing && !error && translationVisible && translation ? (
                        <p className={styles.translation}>{translation}</p>
                    ) : null}
                </div>
                {error && onRetry ? (
                    <Action onClick={onRetry} tone='danger'>
                        <RotateCcwIcon />
                        Try again
                    </Action>
                ) : null}
                {!typing && !error ? (
                    <div className={styles.actions}>
                        {onPlayAudio ? (
                            <Action onClick={onPlayAudio}>
                                <Volume2Icon />
                                Listen
                            </Action>
                        ) : null}
                        {onToggleTranslation && translation ? (
                            <Action
                                onClick={onToggleTranslation}
                                pressed={translationVisible}
                            >
                                <LanguagesIcon />
                                {translationVisible
                                    ? 'Hide translation'
                                    : 'Show translation'}
                            </Action>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </article>
    );
}
function Action({
    children,
    onClick,
    pressed,
    tone,
}: {
    children: React.ReactNode;
    onClick: () => void;
    pressed?: boolean;
    tone?: 'danger';
}) {
    return (
        <button
            type='button'
            onClick={onClick}
            aria-pressed={pressed}
            className={tone ? styles.dangerAction : styles.action}
        >
            {children}
        </button>
    );
}
