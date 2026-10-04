'use client';
import { useSentenceCopy } from '../sentence-copy';

import { useEffect, useState } from 'react';
import { Button, InlineAlert } from '@/fsd/shared/ui';
import type { ApiError } from '../../lib/api-error';

const messages: Record<string, string> = {
    authentication_required: 'Your session expired. Sign in again to continue.',
    dictionary_not_found:
        'This dictionary is no longer available. Close practice to return.',
    shared_dictionary_not_found:
        'Access to this dictionary has changed. Close practice to return.',
    feature_disabled: 'Sentence practice is not available right now.',
    stale_content:
        'These dictionary entries changed. Reload practice to use current sentences.',
    model_unavailable:
        'Your selected AI model is unavailable. Choose another model or continue with saved reference answers.',
    capacity_unavailable:
        'AI tasks are at capacity. Wait a moment and try again.',
    ai_credits_exhausted:
        'You have no AI credits available. Saved reference answers remain free.',
    daily_limit_exceeded:
        'Your daily AI limit has been reached. Saved reference answers remain free.',
    network_timeout:
        'The request could not be confirmed. Recover its result before starting another task.',
    job_not_found:
        'The task result could not be confirmed. Try to recover the task.',
};
export function SentenceErrorNotice({
    error,
    onRetry,
    onOpenPreferences,
}: {
    error: ApiError;
    onRetry?: (() => void) | undefined;
    onOpenPreferences?: (() => void) | undefined;
}) {
    const { t } = useSentenceCopy();
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        if (!error.retryAt) return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [error.retryAt]);
    const remaining = error.retryAt
        ? Math.max(0, Math.ceil((error.retryAt - now) / 1000))
        : 0;
    const accessLost = [
        'authentication_required',
        'dictionary_not_found',
        'shared_dictionary_not_found',
        'feature_disabled',
    ].includes(error.code);
    return (
        <InlineAlert
            tone='error'
            title={t('Practice needs your attention')}
            actions={
                <div className='flex flex-wrap gap-2'>
                    {onRetry && !accessLost ? (
                        <Button
                            size='compact'
                            variant='secondary'
                            disabled={remaining > 0}
                            onClick={onRetry}
                        >
                            {remaining
                                ? t('Try again in {seconds}s').replace(
                                      '{seconds}',
                                      String(remaining),
                                  )
                                : t('Try again')}
                        </Button>
                    ) : null}
                    {error.code === 'model_unavailable' && onOpenPreferences ? (
                        <Button
                            size='compact'
                            variant='secondary'
                            onClick={onOpenPreferences}
                        >
                            {t('AI preferences')}
                        </Button>
                    ) : null}
                </div>
            }
        >
            {t(
                messages[error.code] ??
                    'Practice could not finish this request. Your existing answers are kept.',
            )}
        </InlineAlert>
    );
}
