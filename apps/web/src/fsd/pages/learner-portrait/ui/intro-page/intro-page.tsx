'use client';

import {
    ArrowLeft,
    Clock,
    Coins,
    Gift,
    MessageCircle,
    Pencil,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import {
    invalidatePortraitInterviewStatusCache,
    portraitApi,
} from '@/fsd/entities/learner-portrait';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, ButtonLink, InlineAlert } from '@/fsd/shared/ui';
import {
    usePortraitManagement,
    type PortraitManagement,
} from '../../hooks/use-portrait-management';
import { portraitCopy } from '../../lib/copy';
import { DataUseDetails } from '../data-use-details/data-use-details';
import { PortraitPageState } from '../page-state/page-state';
import styles from '../common.module.css';

export function PortraitIntroPage() {
    const management = usePortraitManagement();
    return (
        <PortraitPageState management={management}>
            <PortraitIntro key={management.ownerId} management={management} />
        </PortraitPageState>
    );
}

function PortraitIntro({ management }: { management: PortraitManagement }) {
    const { locale, formatDate } = useI18n();
    const router = useRouter();
    const params = useSearchParams();
    const restartFailed = params.get('restart') === 'failed';
    const [pending, setPending] = useState(false);
    const [failed, setFailed] = useState(false);
    const state = management.query.data!;
    const status = management.status.data!;
    const isUpdate = Boolean(state.approved);
    const interview = status.interview;
    const costIcon = status.creditsBypass ? (
        <Gift aria-hidden />
    ) : (
        <Coins aria-hidden />
    );
    function back() {
        router.push('/portrait');
    }
    async function start() {
        if (pending || !management.ownerId) return;
        setPending(true);
        setFailed(false);
        try {
            await management.requestWithSession((token) =>
                portraitApi.startInterview(token, {
                    expectedVersion: state.version,
                    locale,
                }),
            );
            await invalidatePortraitInterviewStatusCache(
                management.client,
                management.ownerId,
            );
            router.push('/portrait/interview');
        } catch {
            setFailed(true);
            setPending(false);
        }
    }
    async function discard() {
        await management.discard();
    }
    return (
        <main className={`${styles.page} ${styles.intro} ${styles.stack}`}>
            <div>
                <Button
                    variant='ghost'
                    size='compact'
                    onClick={back}
                    leadingIcon={<ArrowLeft aria-hidden size={16} />}
                >
                    {portraitCopy(locale, 'back')}
                </Button>
            </div>
            <header>
                <p className={styles.eyebrow}>
                    {portraitCopy(locale, 'title')}
                </p>
                <h1 className={`${styles.title} ${styles.heroTitle}`}>
                    {portraitCopy(
                        locale,
                        isUpdate ? 'introUpdate' : 'introTitle',
                    )}
                </h1>
                <p className={styles.body}>
                    {portraitCopy(locale, 'introTime')}
                </p>
                <p className={styles.body}>
                    {portraitCopy(locale, 'introScope')}
                </p>
                {isUpdate && (
                    <p className={styles.small}>
                        {portraitCopy(locale, 'readApproved')}
                    </p>
                )}
            </header>
            <div className={styles.noticeStack}>
                <div className={styles.notice}>
                    {costIcon}
                    <p>
                        {portraitCopy(
                            locale,
                            status.creditsBypass ? 'free' : 'paid',
                        )}
                    </p>
                </div>
                <div className={styles.notice}>
                    <Clock aria-hidden />
                    <p>{portraitCopy(locale, 'expiry')}</p>
                </div>
            </div>
            <DataUseDetails />
            {restartFailed && (
                <InlineAlert tone='error'>
                    {portraitCopy(locale, 'restartFailed')}
                </InlineAlert>
            )}
            {(failed || Boolean(management.error)) && (
                <InlineAlert tone='error'>
                    {portraitCopy(locale, 'actionError')}
                </InlineAlert>
            )}
            {interview ? (
                <section className={styles.panel}>
                    <h2 className={styles.sectionTitle}>
                        {portraitCopy(locale, 'pendingTitle')}
                    </h2>
                    <p className={styles.small}>
                        {portraitCopy(locale, 'pendingBody')}{' '}
                        {formatDate(interview.expiresAt)}
                    </p>
                    <div className={styles.actions}>
                        <ButtonLink href='/portrait/interview'>
                            {portraitCopy(locale, 'resume')}
                        </ButtonLink>
                        <ButtonLink variant='secondary' href='/portrait/review'>
                            {portraitCopy(locale, 'review')}
                        </ButtonLink>
                        <Button
                            variant='ghost'
                            onClick={discard}
                            loading={management.pending}
                        >
                            {portraitCopy(locale, 'discard')}
                        </Button>
                    </div>
                </section>
            ) : (
                <div className={styles.actions}>
                    <Button
                        size='large'
                        onClick={start}
                        loading={pending}
                        leadingIcon={<MessageCircle aria-hidden size={20} />}
                    >
                        {portraitCopy(locale, 'start')}
                    </Button>
                    <ButtonLink
                        size='large'
                        href='/portrait/manual'
                        variant='secondary'
                        leadingIcon={<Pencil aria-hidden size={20} />}
                    >
                        {portraitCopy(locale, 'manual')}
                    </ButtonLink>
                    <Button size='large' variant='ghost' onClick={back}>
                        {portraitCopy(locale, 'back')}
                    </Button>
                </div>
            )}
        </main>
    );
}
