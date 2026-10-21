'use client';

import { useState } from 'react';
import { MessageCircle, Pencil, Trash2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    PortraitDetailsList,
    PortraitSummaryPanel,
} from '@/fsd/features/portrait-editor';
import { PortraitEntryCard } from '@/fsd/features/portrait-entry';
import { useI18n } from '@/fsd/shared/i18n';
import { Badge, Button, ButtonLink, InlineAlert } from '@/fsd/shared/ui';
import {
    usePortraitManagement,
    type PortraitManagement,
} from '../../hooks/use-portrait-management';
import { portraitCopy } from '../../lib/copy';
import { DataUseDetails } from '../data-use-details/data-use-details';
import { DeletePortraitDialog } from '../delete-dialog/delete-dialog';
import { PortraitPageState } from '../page-state/page-state';
import { PortraitUseControl } from '../use-control/use-control';
import styles from '../common.module.css';

export function PortraitOverviewPage() {
    const management = usePortraitManagement();
    return (
        <PortraitPageState management={management}>
            <PortraitOverview
                key={management.ownerId}
                management={management}
            />
        </PortraitPageState>
    );
}

function PortraitOverview({ management }: { management: PortraitManagement }) {
    const { locale, formatDate } = useI18n();
    const params = useSearchParams();
    const router = useRouter();
    const [deleteOpen, setDeleteOpen] = useState(false);
    const state = management.query.data!;
    const portrait = state.approved;
    const interview = management.status.data?.interview;
    const unfinished = interview ?? state.draft;
    const saved = params.get('saved');
    let statusKey: 'draft' | 'on' | 'off' = 'draft';
    if (portrait) statusKey = state.useEnabled ? 'on' : 'off';
    const showSaved = Boolean(saved && portrait);
    const isFirst = saved === 'first';
    const showEnable = isFirst && !state.useEnabled;
    function clearSaved() {
        router.replace('/portrait');
    }
    async function enable() {
        const result = await management.setUse(true);
        if (result) clearSaved();
    }
    async function discard() {
        await management.discard();
    }
    function openDelete() {
        setDeleteOpen(true);
    }
    function closeDelete() {
        setDeleteOpen(false);
    }
    return (
        <main className={`${styles.page} ${styles.stack}`}>
            <header className={styles.header}>
                <div className={styles.grow}>
                    <p className={styles.small}>
                        {portraitCopy(locale, 'account')}
                    </p>
                    <h1 className={styles.title}>
                        {portraitCopy(locale, 'title')}
                    </h1>
                    <p className={styles.body}>
                        {portraitCopy(locale, 'subtitle')}
                    </p>
                </div>
                {(portrait || interview) && (
                    <Badge tone={state.useEnabled ? 'success' : 'neutral'}>
                        {portraitCopy(locale, statusKey)}
                    </Badge>
                )}
            </header>
            {showSaved && (
                <InlineAlert
                    tone='success'
                    title={portraitCopy(locale, isFirst ? 'saved' : 'updated')}
                    onDismiss={clearSaved}
                    actions={
                        showEnable ? (
                            <Button
                                size='compact'
                                onClick={enable}
                                loading={management.pending}
                            >
                                {portraitCopy(locale, 'use')}
                            </Button>
                        ) : undefined
                    }
                >
                    {portraitCopy(
                        locale,
                        isFirst ? 'firstSaved' : 'updateSaved',
                    )}
                </InlineAlert>
            )}
            {Boolean(management.error) && (
                <InlineAlert tone='error'>
                    {portraitCopy(locale, 'actionError')}
                </InlineAlert>
            )}
            {!portrait && (
                <PortraitEntryCard
                    variant='settings'
                    requestWithSession={management.requestWithSession}
                />
            )}
            {portrait && (
                <>
                    {unfinished && (
                        <InlineAlert
                            title={portraitCopy(locale, 'pendingUpdate')}
                            actions={
                                <div className={styles.row}>
                                    {interview && (
                                        <ButtonLink
                                            href='/portrait/interview'
                                            size='compact'
                                        >
                                            {portraitCopy(locale, 'resume')}
                                        </ButtonLink>
                                    )}
                                    <ButtonLink
                                        href='/portrait/review'
                                        size='compact'
                                        variant='secondary'
                                    >
                                        {portraitCopy(locale, 'review')}
                                    </ButtonLink>
                                    <Button
                                        size='compact'
                                        variant='ghost'
                                        onClick={discard}
                                        loading={management.pending}
                                    >
                                        {portraitCopy(locale, 'discard')}
                                    </Button>
                                </div>
                            }
                        >
                            {portraitCopy(locale, 'pendingBody')}{' '}
                            {formatDate(unfinished.expiresAt)}
                        </InlineAlert>
                    )}
                    <PortraitUseControl management={management} />
                    <PortraitSummaryPanel
                        items={portrait.items}
                        locale={portrait.locale}
                        summary={portrait.summary}
                    />
                    <section className={styles.panel}>
                        <div className={styles.header}>
                            <h2 className={styles.sectionTitle}>
                                {portraitCopy(locale, 'details')}
                            </h2>
                            <ButtonLink
                                size='compact'
                                variant='secondary'
                                href='/portrait/manual'
                                leadingIcon={<Pencil aria-hidden size={16} />}
                            >
                                {portraitCopy(locale, 'edit')}
                            </ButtonLink>
                        </div>
                        <PortraitDetailsList
                            items={portrait.items}
                            locale={locale}
                        />
                        <p className={styles.meta}>
                            {portraitCopy(locale, 'lastUpdated')}{' '}
                            {formatDate(portrait.updatedAt)}
                        </p>
                    </section>
                    <div className={styles.row}>
                        <ButtonLink
                            variant='secondary'
                            href='/portrait/manual'
                            leadingIcon={<Pencil aria-hidden size={16} />}
                        >
                            {portraitCopy(locale, 'edit')}
                        </ButtonLink>
                        <ButtonLink
                            variant='secondary'
                            href={
                                interview
                                    ? '/portrait/interview'
                                    : '/portrait/intro?mode=update'
                            }
                            leadingIcon={
                                <MessageCircle aria-hidden size={16} />
                            }
                        >
                            {portraitCopy(locale, 'update')}
                        </ButtonLink>
                        <Button
                            className={styles.deleteAction}
                            variant='danger'
                            onClick={openDelete}
                            leadingIcon={<Trash2 aria-hidden size={16} />}
                        >
                            {portraitCopy(locale, 'delete')}
                        </Button>
                    </div>
                </>
            )}
            <DataUseDetails />
            <DeletePortraitDialog
                open={deleteOpen}
                onClose={closeDelete}
                management={management}
            />
        </main>
    );
}
