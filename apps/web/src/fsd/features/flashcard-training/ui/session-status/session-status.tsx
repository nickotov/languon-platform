import styles from './session-status.module.css';
import { AlertTriangle, Lock } from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import { Button } from '@/fsd/shared/ui';
import type { SessionState } from '../../hooks/use-practice-session';
import { RetryButton } from '../retry-button/retry-button';

export function SessionStatus({
    state,
    signedIn,
    onRetry,
    onClose,
}: {
    state: SessionState;
    signedIn: boolean;
    onRetry(): void;
    onClose(): void;
}) {
    const { t } = useI18n();

    const unavailable = state.phase === 'unavailable';

    const Icon = unavailable ? Lock : AlertTriangle;

    const title = t(unavailable ? 'training.accessLost' : 'training.error');

    function resolveBody() {
        if (unavailable) {
            return 'training.accessLostHelp' as const;
        }

        if (state.error?.code === 'rate_limited') {
            return 'training.rateLimited' as const;
        }

        return 'training.network' as const;
    }

    const body = t(resolveBody());

    const saved = t('training.savedBefore', { count: state.savedCount });

    const close = t(unavailable ? 'training.close' : 'training.endSession');

    return (
        <div role='alert' className={styles.status}>
            <span className={styles.symbol}>
                <Icon aria-hidden className={styles.icon} />
            </span>
            <h3 className={styles.title}>{title}</h3>
            <p className={styles.body}>{body}</p>
            {signedIn && state.savedCount > 0 && (
                <p className={styles.saved}>{saved}</p>
            )}
            <div className={styles.actions}>
                {!unavailable && (
                    <RetryButton
                        retryAt={state.errorRetryAt}
                        onRetry={onRetry}
                    />
                )}
                <Button variant='secondary' onClick={onClose}>
                    {close}
                </Button>
            </div>
        </div>
    );
}
