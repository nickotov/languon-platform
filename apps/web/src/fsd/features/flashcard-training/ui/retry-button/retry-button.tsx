import { useEffect, useState } from 'react';
import { useI18n } from '@/fsd/shared/i18n';
import { Button } from '@/fsd/shared/ui';
import type { ApiError } from '../../lib/api-error';

export function RetryButton({
    retryAt,
    onRetry,
    error,
    disabled = false,
}: {
    retryAt?: number | undefined;
    onRetry(): void;
    error?: ApiError | null | undefined;
    disabled?: boolean;
}) {
    const { t } = useI18n();
    const [now, setNow] = useState(Date.now);
    const deadline = retryAt ?? error?.retryAt;
    useEffect(() => {
        if (!deadline) return;
        const timer = setInterval(() => setNow(Date.now()), 250);
        return () => clearInterval(timer);
    }, [deadline]);
    const remaining = Math.max(0, Math.ceil(((deadline ?? 0) - now) / 1000));
    const label =
        remaining > 0
            ? t('training.retryIn', { seconds: remaining })
            : t('training.retry');
    return (
        <Button
            variant='secondary'
            size='compact'
            onClick={onRetry}
            disabled={disabled || remaining > 0}
        >
            {label}
        </Button>
    );
}
