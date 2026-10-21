'use client';

import { ArrowLeft, Compass, MessageCircle, Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { PortraitItems } from '@languon/contracts';
import {
    PortraitEditor,
    PortraitSummaryPanel,
    PortraitUpdateDiff,
    emptyPortraitItems,
} from '@/fsd/features/portrait-editor';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, ButtonLink, InlineAlert } from '@/fsd/shared/ui';
import { type PortraitManagement } from '../../hooks/use-portrait-management';
import { usePortraitEditorSession } from '../../hooks/use-portrait-editor-session';
import { portraitCopy } from '../../lib/copy';
import { ConflictPanel } from '../conflict-panel/conflict-panel';
import { ProposalCard } from '../proposal-card/proposal-card';
import { PortraitMobileSave, PortraitSavePanel } from './save-panel';
import styles from '../common.module.css';
import { DiscardInterviewDialog } from './discard-interview-dialog';
import { RestartInterviewDialog } from './restart-interview-dialog';

export function ReviewEditor({
    management,
    proposal,
    proposalStale,
    sessionError,
}: {
    management: PortraitManagement;
    proposal: PortraitItems | undefined;
    proposalStale: boolean;
    sessionError: boolean;
}) {
    const { locale } = useI18n();
    const params = useSearchParams();
    const editor = usePortraitEditorSession(management, true);
    const [restartOpen, setRestartOpen] = useState(false);
    const [discardOpen, setDiscardOpen] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    const [staleProposal, setStaleProposal] = useState<PortraitItems | null>(
        null,
    );
    const state = management.query.data!;
    const approved = state.approved;
    const interview = management.status.data?.interview;
    const summaryLocale = interview?.locale ?? state.draft?.locale ?? locale;
    const showProposal = Boolean(
        proposal &&
        !dismissed &&
        JSON.stringify(proposal) !== JSON.stringify(editor.items),
    );
    const showResourceLimit = Boolean(params.get('restart'));
    const conflictItems = staleProposal ?? editor.items;
    const showConflict = Boolean(editor.conflict || staleProposal);
    const latestItems = staleProposal
        ? editor.items
        : (editor.conflict?.approved?.items ?? emptyPortraitItems());
    let blocker: string | null = null;
    if (showConflict) blocker = portraitCopy(locale, 'chooseAll');
    else if (!editor.meaningful) blocker = portraitCopy(locale, 'nothing');
    else if (!editor.valid) blocker = portraitCopy(locale, 'invalid');
    function openRestart() {
        setRestartOpen(true);
    }
    function closeRestart() {
        setRestartOpen(false);
    }
    function save() {
        void editor.save(summaryLocale);
    }
    function openDiscard() {
        setDiscardOpen(true);
    }
    function closeDiscard() {
        if (!management.pending) setDiscardOpen(false);
    }
    function dismissProposal() {
        setDismissed(true);
    }
    function acceptProposal(items: PortraitItems) {
        if (proposalStale) setStaleProposal(items);
        else editor.setItems(items);
        setDismissed(true);
    }
    function reconcile(items: PortraitItems) {
        editor.reconcile(items);
        setStaleProposal(null);
    }
    return (
        <main className={`${styles.page} ${styles.wide}`}>
            <ButtonLink
                href='/portrait/interview'
                variant='ghost'
                size='compact'
                leadingIcon={<ArrowLeft aria-hidden size={16} />}
            >
                {portraitCopy(locale, 'continue')}
            </ButtonLink>
            <header className={styles.editingHeader}>
                <p className={styles.eyebrow}>
                    {portraitCopy(locale, 'notSaved')}
                </p>
                <h1 className={styles.title}>
                    {portraitCopy(locale, 'draftTitle')}
                </h1>
                <p className={styles.body}>
                    {portraitCopy(locale, 'draftBody')}
                </p>
            </header>
            {showResourceLimit && (
                <InlineAlert
                    tone='warning'
                    title={portraitCopy(locale, 'lengthLimit')}
                    actions={
                        <Button onClick={openRestart} size='compact'>
                            {portraitCopy(locale, 'restart')}
                        </Button>
                    }
                >
                    {portraitCopy(locale, 'lengthBody')}
                </InlineAlert>
            )}
            {sessionError && (
                <InlineAlert tone='error'>
                    {portraitCopy(locale, 'actionError')}
                </InlineAlert>
            )}
            <div className={styles.grid}>
                <div className={styles.compactStack}>
                    {showConflict && (
                        <ConflictPanel
                            key={`${editor.conflict?.version ?? state.version}-${Boolean(staleProposal)}`}
                            latest={latestItems}
                            draft={conflictItems}
                            onReconcile={reconcile}
                        />
                    )}
                    <div id='portrait-summary'>
                        <PortraitSummaryPanel
                            items={editor.items}
                            locale={summaryLocale}
                        />
                    </div>
                    {showProposal && proposal && (
                        <ProposalCard
                            items={proposal}
                            onAccept={acceptProposal}
                            onDismiss={dismissProposal}
                        />
                    )}
                    <h2 className={styles.sectionTitle}>
                        {portraitCopy(locale, 'details')}
                    </h2>
                    <PortraitEditor
                        items={editor.items}
                        onChange={editor.setItems}
                        disabled={editor.pending}
                    />
                </div>
                <aside className={styles.sidebar}>
                    {approved && (
                        <PortraitUpdateDiff
                            before={approved.items}
                            after={editor.items}
                            locale={locale}
                        />
                    )}
                    <PortraitSavePanel
                        onSave={save}
                        blocker={blocker}
                        pending={editor.pending}
                        error={editor.error && !editor.conflict}
                        errorReason={editor.errorReason}
                        isUpdate={Boolean(approved)}
                        review
                        expiresAt={
                            interview?.expiresAt ?? state.draft?.expiresAt
                        }
                    />
                    <div className={`${styles.panel} ${styles.compactStack}`}>
                        <ButtonLink
                            href='/portrait/interview'
                            variant='secondary'
                            leadingIcon={
                                <MessageCircle aria-hidden size={16} />
                            }
                        >
                            {portraitCopy(locale, 'continue')}
                        </ButtonLink>
                        <ButtonLink
                            href='/portrait/interview?topic=hobbies'
                            variant='ghost'
                            leadingIcon={<Compass aria-hidden size={16} />}
                        >
                            {portraitCopy(locale, 'explore')}
                        </ButtonLink>
                        <Button
                            variant='ghost'
                            onClick={openDiscard}
                            leadingIcon={<Trash2 aria-hidden size={16} />}
                        >
                            {portraitCopy(locale, 'discard')}
                        </Button>
                    </div>
                </aside>
            </div>
            <PortraitMobileSave
                onSave={save}
                blocker={blocker}
                pending={editor.pending}
            />
            <RestartInterviewDialog
                open={restartOpen}
                onClose={closeRestart}
                management={management}
            />
            <DiscardInterviewDialog
                open={discardOpen}
                onClose={closeDiscard}
                management={management}
            />
        </main>
    );
}
