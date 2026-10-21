'use client';

import { Hourglass, MessageCircle, Pencil, Sparkles } from 'lucide-react';
import {
    type PortraitSessionRequest,
    ownerScopedPortraitRequest,
    usePortraitInterviewStatus,
    usePortraitState,
} from '@/fsd/entities/learner-portrait';
import { useSessionStore } from '@/fsd/entities/session';
import { useI18n } from '@/fsd/shared/i18n';
import { Badge, Button, ButtonLink, InlineAlert } from '@/fsd/shared/ui';
import { entryCopy } from '../../lib/copy';
import { usePortraitEntryEnable } from '../../hooks/use-portrait-entry-enable';
import styles from './portrait-entry-card.module.css';

export function PortraitEntryCard({
    variant,
    requestWithSession: sessionRequest,
}: {
    variant: 'dashboard' | 'settings';
    requestWithSession: PortraitSessionRequest;
}) {
    const ownerId = useSessionStore((state) => state.user?.id ?? null);
    const requestWithSession = ownerScopedPortraitRequest(
        ownerId,
        sessionRequest,
        () => useSessionStore.getState().user?.id ?? null,
    );
    const { locale, formatDate } = useI18n();
    const query = usePortraitState({ ownerId, requestWithSession });
    const status = usePortraitInterviewStatus({ ownerId, requestWithSession });
    const text = entryCopy[locale];
    const Heading = variant === 'dashboard' ? 'h2' : 'h3';
    const state = query.data;
    const { pending, failed, enable } = usePortraitEntryEnable({
        ownerId,
        state,
        requestWithSession,
    });
    const interview = status.data?.interview;
    const portrait = state?.approved;
    const unfinished = interview ?? state?.draft;
    const isEmpty = !portrait && !unfinished;
    const isInterview = !portrait && Boolean(unfinished);
    const isSavedOff = Boolean(portrait && !state?.useEnabled);
    const isActive = Boolean(portrait && state?.useEnabled);
    let title = text.empty;
    let body = text.emptyBody;
    if (isInterview) {
        title = interview ? text.pending : text.pendingDraft;
        body = text.resumeBody;
    }
    if (isSavedOff) {
        title = text.saved;
        body = text.savedBody;
    }
    if (isActive) {
        title = text.active;
        body = text.activeBody;
    }
    let badge = text.draft;
    if (portrait) badge = state?.useEnabled ? text.on : text.off;
    function retry() {
        void query.refetch();
        void status.refetch();
    }
    if (!ownerId) return null;
    if (query.isPending || status.isPending)
        return (
            <section className={styles.card} aria-busy='true'>
                <p className={styles.eyebrow}>{text.title}</p>
                <div className={styles.skeleton} />
            </section>
        );
    if (query.isError || status.isError)
        return (
            <section className={styles.card}>
                <InlineAlert
                    tone='error'
                    title={text.error}
                    actions={
                        <Button onClick={retry} size='compact'>
                            {text.retry}
                        </Button>
                    }
                />
            </section>
        );
    return (
        <section
            className={styles.card}
            aria-labelledby={`portrait-entry-${variant}`}
        >
            <div className={styles.layout}>
                <span className={styles.icon}>
                    <Sparkles aria-hidden size={20} />
                </span>
                <div className={styles.content}>
                    <div className={styles.row}>
                        <p className={styles.eyebrow}>{text.title}</p>
                        {!isEmpty && (
                            <Badge tone={isActive ? 'success' : 'neutral'}>
                                {badge}
                            </Badge>
                        )}
                    </div>
                    <Heading
                        id={`portrait-entry-${variant}`}
                        className={styles.title}
                    >
                        {title}
                    </Heading>
                    <p className={styles.body}>
                        {body}{' '}
                        {isInterview && unfinished
                            ? formatDate(unfinished.expiresAt)
                            : null}
                    </p>
                    {portrait && (
                        <p className={styles.body}>
                            {text.lastUpdated} {formatDate(portrait.updatedAt)}
                        </p>
                    )}
                    <div className={styles.actions}>
                        {isEmpty && (
                            <>
                                <ButtonLink
                                    href='/portrait/intro'
                                    leadingIcon={
                                        <MessageCircle aria-hidden size={16} />
                                    }
                                >
                                    {text.start}
                                </ButtonLink>
                                <ButtonLink
                                    href='/portrait/manual'
                                    variant='secondary'
                                    leadingIcon={
                                        <Pencil aria-hidden size={16} />
                                    }
                                >
                                    {text.manual}
                                </ButtonLink>
                            </>
                        )}
                        {isInterview && (
                            <>
                                {interview && (
                                    <ButtonLink href='/portrait/interview'>
                                        {text.resume}
                                    </ButtonLink>
                                )}
                                <ButtonLink
                                    href='/portrait/review'
                                    variant='secondary'
                                >
                                    {text.review}
                                </ButtonLink>
                            </>
                        )}
                        {isSavedOff && (
                            <Button onClick={enable} loading={pending}>
                                {text.use}
                            </Button>
                        )}
                        {portrait && (
                            <ButtonLink href='/portrait' variant='secondary'>
                                {text.view}
                            </ButtonLink>
                        )}
                        {isActive && !interview && (
                            <ButtonLink
                                href='/portrait/intro?mode=update'
                                variant='ghost'
                                leadingIcon={
                                    <MessageCircle aria-hidden size={16} />
                                }
                            >
                                {text.update}
                            </ButtonLink>
                        )}
                    </div>
                    {portrait && unfinished && (
                        <div className={styles.pending}>
                            <Hourglass aria-hidden size={16} />
                            <p>
                                {text.pendingUpdate}{' '}
                                {formatDate(unfinished.expiresAt)}
                            </p>
                            <ButtonLink
                                href={
                                    interview
                                        ? '/portrait/interview'
                                        : '/portrait/review'
                                }
                                size='compact'
                                variant='secondary'
                            >
                                {interview ? text.resume : text.review}
                            </ButtonLink>
                        </div>
                    )}
                    {failed && (
                        <InlineAlert tone='error'>
                            {text.actionError}
                        </InlineAlert>
                    )}
                </div>
            </div>
        </section>
    );
}
