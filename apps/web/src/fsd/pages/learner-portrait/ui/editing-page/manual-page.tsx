'use client';

import { ArrowLeft } from 'lucide-react';
import {
    PortraitEditor,
    PortraitSummaryPanel,
    PortraitUpdateDiff,
    emptyPortraitItems,
} from '@/fsd/features/portrait-editor';
import { useI18n } from '@/fsd/shared/i18n';
import { ButtonLink } from '@/fsd/shared/ui';
import {
    usePortraitManagement,
    type PortraitManagement,
} from '../../hooks/use-portrait-management';
import { usePortraitEditorSession } from '../../hooks/use-portrait-editor-session';
import { portraitCopy } from '../../lib/copy';
import { ConflictPanel } from '../conflict-panel/conflict-panel';
import { PortraitPageState } from '../page-state/page-state';
import { PortraitMobileSave, PortraitSavePanel } from './save-panel';
import styles from '../common.module.css';

export function PortraitManualPage() {
    const management = usePortraitManagement();
    return (
        <PortraitPageState management={management}>
            <PortraitManual key={management.ownerId} management={management} />
        </PortraitPageState>
    );
}

function PortraitManual({ management }: { management: PortraitManagement }) {
    const { locale } = useI18n();
    const editor = usePortraitEditorSession(management, false);
    const approved = management.query.data!.approved;
    const isUpdate = Boolean(approved);
    const summaryLocale = approved?.locale ?? locale;
    let blocker: string | null = null;
    if (editor.conflict) blocker = portraitCopy(locale, 'chooseAll');
    else if (!editor.meaningful) blocker = portraitCopy(locale, 'nothing');
    else if (!editor.valid) blocker = portraitCopy(locale, 'invalid');
    else if (editor.unchanged) blocker = portraitCopy(locale, 'noChanges');
    function save() {
        void editor.save(summaryLocale);
    }
    return (
        <main className={`${styles.page} ${styles.wide}`}>
            <ButtonLink
                href='/portrait'
                variant='ghost'
                size='compact'
                leadingIcon={<ArrowLeft aria-hidden size={16} />}
            >
                {portraitCopy(locale, 'back')}
            </ButtonLink>
            <header className={styles.editingHeader}>
                <h1 className={styles.title}>
                    {portraitCopy(
                        locale,
                        isUpdate ? 'editTitle' : 'manualTitle',
                    )}
                </h1>
                <p className={styles.body}>
                    {portraitCopy(locale, 'editBody')}
                </p>
                {isUpdate && (
                    <p className={styles.small}>
                        {portraitCopy(locale, 'preservedUse')}
                    </p>
                )}
            </header>
            <div className={styles.grid}>
                <div className={styles.compactStack}>
                    {editor.conflict && (
                        <ConflictPanel
                            key={editor.conflict.version}
                            latest={
                                editor.conflict.approved?.items ??
                                emptyPortraitItems()
                            }
                            draft={editor.items}
                            onReconcile={editor.reconcile}
                        />
                    )}
                    <PortraitEditor
                        items={editor.items}
                        onChange={editor.setItems}
                        disabled={editor.pending}
                    />
                </div>
                <aside className={styles.sidebar}>
                    <div id='portrait-summary'>
                        <PortraitSummaryPanel
                            items={editor.items}
                            locale={summaryLocale}
                        />
                    </div>
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
                        isUpdate={isUpdate}
                        review={false}
                    />
                </aside>
            </div>
            <PortraitMobileSave
                onSave={save}
                blocker={blocker}
                pending={editor.pending}
            />
        </main>
    );
}
