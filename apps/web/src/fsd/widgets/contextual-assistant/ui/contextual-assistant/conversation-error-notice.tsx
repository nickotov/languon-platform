import {
    ConversationApiError,
    conversationCopy,
} from '@/fsd/entities/conversation';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, ButtonLink } from '@/fsd/shared/ui';
import styles from './contextual-assistant.module.css';

/** Render only stable product guidance, never arbitrary backend/provider messages. */
export function ConversationErrorNotice({
    error,
    code,
    onRetry,
    retryLabel,
    disabled = false,
}: {
    error?: unknown;
    code?: string | null;
    onRetry(): void;
    retryLabel?: string | undefined;
    disabled?: boolean;
}) {
    const { locale, href } = useI18n();
    const copy = conversationCopy(locale);
    const failureCode =
        code ??
        (error instanceof ConversationApiError ? error.detail.code : null);
    const actionLabel = retryLabel ?? copy.retry;
    let message = copy.error;
    let action = (
        <Button variant='secondary' onClick={onRetry} disabled={disabled}>
            {actionLabel}
        </Button>
    );
    if (failureCode === 'model_unavailable') {
        message = copy.modelUnavailable;
        action = (
            <ButtonLink variant='secondary' href={href('/profile')}>
                {copy.chooseModel}
            </ButtonLink>
        );
    }
    if (failureCode === 'credits_exhausted') {
        message = copy.creditsExhausted;
        action = (
            <ButtonLink variant='secondary' href={href('/profile?tab=credits')}>
                {copy.viewCredits}
            </ButtonLink>
        );
    }
    if (
        failureCode === 'capacity_unavailable' ||
        failureCode === 'rate_limited'
    )
        message = copy.capacityUnavailable;
    if (failureCode === 'context_too_large') {
        message = copy.contextTooLarge;
        action = <></>;
    }
    return (
        <div>
            <p role='alert' className={styles.error}>
                {message}
            </p>
            {action}
        </div>
    );
}
