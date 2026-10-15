import type { TextFolder } from '@languon/contracts';
import {
    ArchiveIcon,
    ArchiveRestoreIcon,
    Link2Icon,
    MoreHorizontalIcon,
    PencilIcon,
    PlusIcon,
    Share2Icon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Badge,
    Breadcrumb,
    Button,
    InlineAlert,
    Menu,
    type MenuItem,
} from '@/fsd/shared/ui';
import styles from './folder-page.module.css';
export type FolderAction = 'edit-folder' | 'share-folder' | 'archive-folder';
export function FolderHeader({
    folder,
    pending,
    onAction,
    onRestore,
}: {
    folder: TextFolder;
    pending: boolean;
    onAction(type: FolderAction): void;
    onRestore(): void;
}) {
    const { t, href } = useI18n();
    const router = useRouter();
    const archived = folder.lifecycle === 'archived';
    const canShare = (folder.translatedCount ?? 0) > 0;
    let shareLabel = t('texts.library.shareDisabled');
    if (canShare)
        shareLabel = folder.isShared
            ? t('texts.folder.manageShare')
            : t('texts.library.share');
    function edit() {
        onAction('edit-folder');
    }
    function share() {
        onAction('share-folder');
    }
    function archive() {
        onAction('archive-folder');
    }
    function add() {
        router.push(href(`/texts/folders/${folder.id}/new`));
    }
    const items: MenuItem[] = [
        {
            label: t('texts.folder.edit'),
            icon: <PencilIcon className={styles.actionIcon} />,
            onSelect: edit,
        },
        {
            label: shareLabel,
            icon: <Share2Icon className={styles.actionIcon} />,
            onSelect: share,
            disabled: !canShare,
        },
        {
            label: t('texts.library.archive'),
            icon: <ArchiveIcon className={styles.actionIcon} />,
            onSelect: archive,
            tone: 'danger',
            separatorBefore: true,
        },
    ];
    const crumbs = [
        { label: t('texts.library.title'), href: href('/texts') },
        { label: folder.name },
    ];
    const restoreButton = (
        <Button
            variant='secondary'
            size='compact'
            leadingIcon={<ArchiveRestoreIcon className={styles.actionIcon} />}
            onClick={onRestore}
            disabled={pending}
        >
            {t('texts.library.restore')}
        </Button>
    );
    return (
        <>
            <Breadcrumb items={crumbs} ariaLabel={t('texts.library.folders')} />
            <header className={styles.header}>
                <div className={styles.headerCopy}>
                    <h1 className={styles.title}>{folder.name}</h1>
                    {folder.description && (
                        <p className={styles.description}>
                            {folder.description}
                        </p>
                    )}
                    <div className={styles.badges}>
                        {archived && (
                            <Badge
                                size='sm'
                                icon={
                                    <ArchiveIcon
                                        className={styles.actionIcon}
                                    />
                                }
                            >
                                {t('texts.library.archived')}
                            </Badge>
                        )}
                        {folder.isShared && (
                            <Badge
                                size='sm'
                                tone='info'
                                icon={
                                    <Link2Icon className={styles.actionIcon} />
                                }
                            >
                                {t('texts.folder.shared')}
                            </Badge>
                        )}
                    </div>
                </div>
                {!archived && (
                    <div className={styles.headerActions}>
                        <Menu
                            iconOnly
                            label={t('texts.folder.options')}
                            trigger={
                                <MoreHorizontalIcon
                                    className={styles.actionIcon}
                                />
                            }
                            items={items}
                            triggerClassName={styles.folderMenuTrigger}
                        />
                        <Button
                            onClick={add}
                            leadingIcon={
                                <PlusIcon className={styles.actionIcon} />
                            }
                        >
                            {t('texts.folder.add')}
                        </Button>
                    </div>
                )}
            </header>
            {archived && (
                <InlineAlert
                    className={styles.archiveAlert}
                    tone='info'
                    title={t('texts.folder.archiveTitle')}
                    actions={restoreButton}
                >
                    {t('texts.folder.archiveHelp')}
                </InlineAlert>
            )}
        </>
    );
}
