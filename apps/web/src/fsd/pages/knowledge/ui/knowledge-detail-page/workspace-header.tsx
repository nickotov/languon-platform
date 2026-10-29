import { useState, type FocusEvent, type ReactNode } from 'react';
import {
    ArrowLeft,
    CopyPlus,
    EllipsisVertical,
    Globe,
    History,
    Link2,
    Sparkles,
    Trash2,
} from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Button,
    ButtonLink,
    Menu,
    Tooltip,
    useCompanionLayout,
    type MenuItem,
} from '@/fsd/shared/ui';
import { WorkspaceRecovery } from './workspace-recovery';
import {
    WorkspaceLayoutSwitch,
    WorkspaceMobileTabs,
} from './workspace-layout-switch';
import styles from './workspace-controls.module.css';

export function WorkspaceHeader({
    title,
    titleVisible = true,
    stats,
    savedAt,
    recovery,
    draft,
    dirty,
    canSave,
    canPublish,
    busy,
    share,
    shareEnabled = false,
    saveError = false,
    onSave,
    onSaveCopy,
    onHistory,
    onDelete,
    onRetryRecovery,
    practiceHref,
}: {
    title: string;
    practiceHref?: string | undefined;
    titleVisible?: boolean;
    stats?: string;
    savedAt?: string | undefined;
    recovery: 'saved' | 'saving' | 'unsaved' | 'error' | 'conflict';
    draft: boolean;
    dirty: boolean;
    canSave: boolean;
    canPublish: boolean;
    busy: 'save' | 'copy' | 'delete' | 'resolve' | null;
    share?:
        | ((
              open: boolean,
              onOpenChange: (open: boolean) => void,
              anchor: ReactNode,
          ) => ReactNode)
        | undefined;
    shareEnabled?: boolean;
    saveError?: boolean;
    onSave(): void;
    onSaveCopy(): void;
    onHistory(): void;
    onDelete(): void;
    onRetryRecovery(): void;
}) {
    const { t, href } = useI18n();
    const placement = useCompanionLayout();
    const [shareOpen, setShareOpen] = useState(false);
    function openSharing() {
        setTimeout(() => setShareOpen(true), 0);
    }
    function restoreActionFocus(event: FocusEvent<HTMLSpanElement>) {
        if (event.target === event.currentTarget) {
            event.currentTarget
                .querySelector<HTMLButtonElement>(
                    'button[aria-haspopup="menu"]',
                )
                ?.focus({ preventScroll: true });
        }
    }
    function openTutor() {
        placement?.setMode('split');
    }
    function ignoreStats() {
        return undefined;
    }
    const actions: MenuItem[] = [
        {
            label: t('knowledge.saveCopy'),
            icon: <CopyPlus size={16} aria-hidden />,
            disabled: !canSave || busy !== null,
            onSelect: onSaveCopy,
        },
        {
            label: t('knowledge.history'),
            icon: <History size={16} aria-hidden />,
            disabled: draft || busy !== null,
            onSelect: onHistory,
        },
        {
            label: t('knowledge.share'),
            icon: <Link2 size={16} aria-hidden />,
            disabled: draft || !share || busy !== null,
            onSelect: openSharing,
        },
    ];
    if (stats) {
        actions.push({
            label: stats,
            disabled: true,
            separatorBefore: true,
            onSelect: ignoreStats,
        });
    }
    actions.push({
        label: t('knowledge.delete'),
        icon: <Trash2 size={16} aria-hidden />,
        separatorBefore: true,
        tone: 'danger',
        disabled: busy !== null,
        onSelect: onDelete,
    });
    const showOpenTutor = placement?.mode === 'focus';
    const saveDisabled = !canPublish || !dirty || busy !== null;
    let saveHint = t('knowledge.saveHintSave');
    if (!canPublish) saveHint = t('knowledge.saveHintMissing');
    else if (!dirty) saveHint = t('knowledge.saveHintUnchanged');
    const menu = (
        <span
            className={styles.sharingAnchor}
            tabIndex={-1}
            onFocus={restoreActionFocus}
        >
            {shareEnabled && (
                <Tooltip content={t('knowledge.shared')} placement='bottom'>
                    <button
                        type='button'
                        aria-label={t('knowledge.shared')}
                        onClick={openSharing}
                        className={styles.shareTrigger}
                    >
                        <Globe
                            size={16}
                            aria-hidden
                            className={styles.sharedIcon}
                        />
                    </button>
                </Tooltip>
            )}
            <Menu
                label={t('knowledge.documentActions')}
                trigger={<EllipsisVertical size={16} aria-hidden />}
                iconOnly
                items={actions}
                triggerClassName={styles.menuTrigger}
            />
        </span>
    );
    const sharingMenu = share ? share(shareOpen, setShareOpen, menu) : menu;
    const practice = practiceHref ? (
        <ButtonLink href={practiceHref} variant='ghost' size='compact'>
            {t('knowledge.practiceSaved')}
        </ButtonLink>
    ) : null;
    return (
        <header className={styles.header}>
            <div className={styles.topbar} data-workspace-topbar>
                <ButtonLink
                    href={href('/knowledge')}
                    variant='ghost'
                    size='compact'
                    className={styles.back}
                    aria-label={t('knowledge.back')}
                    leadingIcon={<ArrowLeft size={16} aria-hidden />}
                >
                    <span className={styles.backLabel}>
                        {t('knowledge.backShort')}
                    </span>
                </ButtonLink>
                <div
                    className={styles.identity}
                    aria-hidden={titleVisible}
                    data-visible={!titleVisible}
                >
                    <span aria-hidden className={styles.breadcrumbSeparator}>
                        /
                    </span>
                    <p className={styles.breadcrumb}>
                        {title.trim() || t('knowledge.untitled')}
                    </p>
                </div>
                <WorkspaceRecovery
                    status={recovery}
                    savedAt={savedAt}
                    draft={draft}
                    dirty={dirty}
                    saving={busy === 'save'}
                    saveError={saveError}
                    onRetry={onRetryRecovery}
                    onSave={onSave}
                    canSave={!saveDisabled}
                />
                <div className={styles.actions}>
                    <Tooltip content={saveHint} placement='bottom'>
                        <span className={styles.saveWrapper}>
                            <Button
                                size='compact'
                                variant={saveDisabled ? 'secondary' : 'primary'}
                                className={styles.save}
                                disabled={saveDisabled}
                                loading={busy === 'save'}
                                onClick={onSave}
                            >
                                {t('knowledge.saveDocument')}
                            </Button>
                        </span>
                    </Tooltip>
                    {practice}
                    {sharingMenu}
                </div>
                <span className={styles.divider} aria-hidden />
                {showOpenTutor && (
                    <button
                        type='button'
                        onClick={openTutor}
                        className={styles.openTutor}
                    >
                        <Sparkles size={16} aria-hidden />
                        {t('knowledge.openTutor')}
                    </button>
                )}
                <WorkspaceLayoutSwitch />
            </div>
            <WorkspaceMobileTabs />
        </header>
    );
}
