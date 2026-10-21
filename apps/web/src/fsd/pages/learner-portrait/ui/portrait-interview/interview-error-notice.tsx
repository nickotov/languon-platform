'use client';
import { useEffect, useRef } from 'react';
import { Button, ButtonLink, InlineAlert } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import {
    interviewText,
    interviewErrorMessage,
    type InterviewLocale,
} from '../../lib/interview-copy';
import styles from './portrait-interview.module.css';
export function InterviewErrorNotice({
    error,
    locale,
    onReconnect,
    onReview,
}: {
    error: string;
    locale: InterviewLocale;
    onReconnect(): void;
    onReview(): void;
}) {
    const alertRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        // Let the native billing dialog restore its opener before moving focus.
        const frame = requestAnimationFrame(() => {
            const alert = alertRef.current;
            alert?.focus({ preventScroll: true });
            alert?.scrollIntoView?.({ block: 'center' });
        });
        return () => cancelAnimationFrame(frame);
    }, [error]);
    const { href } = useI18n();
    const modelUnavailable = error === 'model_unavailable';
    const creditsUnavailable = error === 'credits_exhausted';
    const modelSettingsLabel = `${interviewText(locale, 'modelSettings')} (${interviewText(locale, 'opensNewTab')})`;
    const creditsLabel = `${interviewText(locale, 'credits')} (${interviewText(locale, 'opensNewTab')})`;
    const limitReached = error === 'resource_limit';
    return (
        <InlineAlert
            ref={alertRef}
            tone='error'
            title={interviewText(locale, 'kept')}
            actions={
                <div className={styles.proposalActions}>
                    <Button size='compact' onClick={onReconnect}>
                        {interviewText(locale, 'reconnect')}
                    </Button>
                    <Button
                        size='compact'
                        variant='secondary'
                        onClick={onReview}
                    >
                        {interviewText(locale, 'manual')}
                    </Button>
                    {modelUnavailable ? (
                        <ButtonLink
                            size='compact'
                            variant='ghost'
                            href={href('/profile?tab=account')}
                            target='_blank'
                            rel='noopener noreferrer'
                            aria-label={modelSettingsLabel}
                        >
                            {interviewText(locale, 'modelSettings')}
                        </ButtonLink>
                    ) : null}
                    {creditsUnavailable ? (
                        <ButtonLink
                            size='compact'
                            variant='ghost'
                            href={href('/profile?tab=credits')}
                            target='_blank'
                            rel='noopener noreferrer'
                            aria-label={creditsLabel}
                        >
                            {interviewText(locale, 'credits')}
                        </ButtonLink>
                    ) : null}
                    {limitReached ? (
                        <ButtonLink
                            size='compact'
                            variant='ghost'
                            href={href('/portrait/review?restart=1')}
                        >
                            {interviewText(locale, 'restart')}
                        </ButtonLink>
                    ) : null}
                </div>
            }
        >
            {interviewErrorMessage(locale, error)}
        </InlineAlert>
    );
}
