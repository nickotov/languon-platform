import type { TextFolder } from '@languon/contracts';
import {
    ArchiveIcon,
    ArchiveRestoreIcon,
    FolderIcon,
    FolderOpenIcon,
    Link2Icon,
    MoreHorizontalIcon,
    PencilIcon,
    Share2Icon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/fsd/shared/i18n';
import { Badge, Button, Menu, type MenuItem } from '@/fsd/shared/ui';
import { libraryRelativeTime } from '../../lib/library-relative-time';
import styles from './library-page.module.css';

type FolderProjection = TextFolder;

export function FolderCard({
    folder,
    onEdit,
    onShare,
    onArchive,
    onRestore,
    pending,
}: {
    folder: FolderProjection;
    onEdit(folder: TextFolder): void;
    onShare(folder: TextFolder): void;
    onArchive(folder: TextFolder): void;
    onRestore(folder: TextFolder): void;
    pending: boolean;
}) {
    const { t, href, locale } = useI18n();
    const router = useRouter();
    const archived = folder.lifecycle === 'archived';
    const target = href(`/texts/folders/${folder.id}`);

    function open() {
        router.push(target);
    }

    function edit() {
        onEdit(folder);
    }

    function share() {
        onShare(folder);
    }

    function archive() {
        onArchive(folder);
    }

    function restore() {
        onRestore(folder);
    }

    const items: MenuItem[] = [
        {
            label: t('texts.library.open'),
            icon: <FolderOpenIcon className={styles.actionIcon} />,
            onSelect: open,
        },
    ];
    if (archived) {
        items.push({
            label: t('texts.library.restore'),
            icon: <ArchiveRestoreIcon className={styles.actionIcon} />,
            onSelect: restore,
            disabled: pending,
        });
    } else {
        const canShare = (folder.translatedCount ?? 0) > 0;
        const shareLabel = canShare
            ? t('texts.library.share')
            : t('texts.library.shareDisabled');
        items.push({
            label: t('texts.library.edit'),
            icon: <PencilIcon className={styles.actionIcon} />,
            onSelect: edit,
        });
        items.push({
            label: shareLabel,
            icon: <Share2Icon className={styles.actionIcon} />,
            onSelect: share,
            disabled: !canShare,
        });
        items.push({
            label: t('texts.library.archive'),
            icon: <ArchiveIcon className={styles.actionIcon} />,
            onSelect: archive,
            separatorBefore: true,
            tone: 'danger',
        });
    }

    const menuLabel = t('texts.library.actions', { name: folder.name });
    const updated = t('texts.library.updated', {
        date: libraryRelativeTime(folder.updatedAt, locale),
    });
    const countsAvailable =
        folder.textCount !== undefined && folder.translatedCount !== undefined;
    const counts = t('texts.library.counts', {
        total: folder.textCount ?? 0,
        translated: folder.translatedCount ?? 0,
    });

    return (
        <article className={styles.card}>
            <div className={styles.cardTop}>
                <span className={styles.folderIcon} aria-hidden='true'>
                    <FolderIcon className={styles.actionIcon} />
                </span>
                <div className={styles.cardCopy}>
                    <h2 className={styles.cardTitle}>
                        <Link href={target} className={styles.stretchedLink}>
                            {folder.name}
                        </Link>
                    </h2>
                    {folder.description ? (
                        <p className={styles.cardDescription}>
                            {folder.description}
                        </p>
                    ) : (
                        <p className={styles.noDescription}>
                            {t('texts.library.noDescription')}
                        </p>
                    )}
                </div>
                <div className={styles.menu}>
                    <Menu
                        iconOnly
                        label={menuLabel}
                        trigger={
                            <MoreHorizontalIcon className={styles.actionIcon} />
                        }
                        items={items}
                        triggerClassName={styles.menuTrigger}
                    />
                </div>
            </div>
            <div className={styles.badges}>
                {archived && (
                    <Badge
                        size='sm'
                        icon={<ArchiveIcon className={styles.actionIcon} />}
                    >
                        {t('texts.library.archived')}
                    </Badge>
                )}
                {folder.isShared && (
                    <Badge
                        size='sm'
                        tone='info'
                        icon={<Link2Icon className={styles.actionIcon} />}
                    >
                        {t('texts.library.shared')}
                    </Badge>
                )}
            </div>
            <div className={styles.cardFooter}>
                {countsAvailable && <span>{counts}</span>}
                <span>{updated}</span>
            </div>
            {archived && (
                <div className={styles.restore}>
                    <Button
                        desktopIconOnly
                        size='compact'
                        variant='secondary'
                        leadingIcon={
                            <ArchiveRestoreIcon className={styles.actionIcon} />
                        }
                        onClick={restore}
                        disabled={pending}
                    >
                        {t('texts.library.restoreShort')}
                    </Button>
                </div>
            )}
        </article>
    );
}
