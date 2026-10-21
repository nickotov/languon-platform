import type { ReactNode } from 'react';
import {
    Archive,
    Check,
    CircleDot,
    Loader2,
    MoreHorizontal,
    Pencil,
    RefreshCw,
    Share2,
    TriangleAlert,
    X,
} from 'lucide-react';
import { TextStatusBadge } from '@/fsd/entities/texts';
import { Button, Menu, type MenuItem } from '@/fsd/shared/ui';
import type { TextWorkspace } from '../../hooks/use-text-workspace';
import { useI18n } from '@/fsd/shared/i18n';
import { useWorkspaceCopy } from './workspace-copy';
import styles from './workspace-page.module.css';

export function WorkspaceHeader({
    ws,
    title,
    actions,
    onClose,
    onRename,
    onShare,
    onArchive,
    onMove,
    onRetranslate,
}: {
    ws: TextWorkspace;
    title: string;
    actions: ReactNode;
    onClose(): void;
    onRename(): void;
    onShare(): void;
    onArchive(): void;
    onMove(): void;
    onRetranslate(): void;
}) {
    const { copy } = useWorkspaceCopy();
    const { t } = useI18n();
    const showMenu =
        Boolean(ws.document) &&
        !ws.saving &&
        !ws.proposal &&
        !(ws.aiActive ?? ws.translation.active) &&
        ws.mode !== 'edit';
    let indicator = copy('notSaved');
    let Indicator = CircleDot;
    if (ws.saving) {
        indicator = copy('saving');
        Indicator = Loader2;
    } else if (ws.saveError) {
        indicator = copy('saveError');
        Indicator = TriangleAlert;
    } else if (ws.unsaved) {
        indicator = copy('unsaved');
    } else if (ws.document) {
        indicator = copy('saved');
        Indicator = Check;
    }

    const menuItems: MenuItem[] = [
        {
            label: t('texts.organization.move'),
            onSelect: onMove,
            disabled: ws.unsaved || ws.aiActive,
        },
        { label: copy('rename'), icon: <Pencil />, onSelect: onRename },
        {
            label: ws.mode === 'read' ? copy('share') : copy('shareDisabled'),
            icon: <Share2 />,
            onSelect: onShare,
            disabled: ws.mode !== 'read',
        },
    ];

    if (ws.mode === 'read') {
        menuItems.push({
            label: copy('retranslate'),
            icon: <RefreshCw />,
            onSelect: onRetranslate,
        });
    }

    menuItems.push({
        label: copy('archive'),
        icon: <Archive />,
        onSelect: onArchive,
        separatorBefore: true,
        tone: 'danger',
    });

    return (
        <header className={styles.header}>
            <Button
                variant='ghost'
                onClick={onClose}
                aria-label={copy('close')}
            >
                <X />
            </Button>
            <div className={styles.heading}>
                <p>
                    {t('texts.library.title')} /{' '}
                    {ws.folder.data?.name ??
                        t('texts.organization.independent')}
                </p>
                <h1>
                    <span>{title}</span>
                    {ws.document && ws.mode !== 'compose' && (
                        <TextStatusBadge status={ws.document.status} />
                    )}
                </h1>
            </div>
            <span
                role='status'
                aria-live='polite'
                className={styles.saveIndicator}
            >
                <Indicator />
                {indicator}
            </span>
            <div className={styles.desktopActions}>{actions}</div>
            {showMenu && (
                <Menu
                    label={copy('options')}
                    iconOnly
                    trigger={<MoreHorizontal />}
                    items={menuItems}
                />
            )}
        </header>
    );
}
