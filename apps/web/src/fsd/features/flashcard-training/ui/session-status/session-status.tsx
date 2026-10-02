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
    const body = t(
        unavailable
            ? 'training.accessLostHelp'
            : state.error?.code === 'rate_limited'
              ? 'training.rateLimited'
              : 'training.network',
    );
    const saved = t('training.savedBefore', { count: state.savedCount });
    const close = t(unavailable ? 'training.close' : 'training.endSession');
    return (
        <div
            role='alert'
            className='mx-auto flex max-w-md flex-col items-center gap-4 py-12 text-center'
        >
            <span className='flex h-12 w-12 items-center justify-center rounded-full bg-background-subtle text-text-secondary'>
                <Icon aria-hidden className='h-6 w-6' />
            </span>
            <h3 className='text-xl font-semibold text-text-primary'>{title}</h3>
            <p className='text-text-secondary'>{body}</p>
            {signedIn && state.savedCount > 0 && (
                <p className='text-sm text-text-secondary'>{saved}</p>
            )}
            <div className='flex flex-wrap justify-center gap-3'>
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
