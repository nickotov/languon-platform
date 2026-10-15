import type { TextDocument } from '@languon/contracts';
import {
    ArchiveIcon,
    ArchiveRestoreIcon,
    ArrowRightIcon,
    Link2Icon,
    MoreHorizontalIcon,
    PencilIcon,
    Share2Icon,
} from 'lucide-react';
import Link from 'next/link';
import { TextStatusBadge } from '@/fsd/entities/texts';
import { useI18n } from '@/fsd/shared/i18n';
import { Badge, Button, Menu, type MenuItem } from '@/fsd/shared/ui';
import { libraryRelativeTime } from '../../lib/library-relative-time';
import styles from './folder-page.module.css';

export type TextRowAction = 'rename' | 'share-text' | 'archive-text';
export function TextRow({
    document,
    readOnly,
    pending,
    onAction,
    onRestore,
}: {
    document: TextDocument;
    readOnly: boolean;
    pending: boolean;
    onAction(type: TextRowAction, document: TextDocument): void;
    onRestore(document: TextDocument): void;
}) {
    const { t, href, locale } = useI18n();
    const archived = document.lifecycle === 'archived';
    const target = href(
        `/texts/folders/${document.folderId}/texts/${document.id}`,
    );
    const canShare = document.status !== 'draft';
    const shareLabel = canShare
        ? t('texts.folder.share')
        : t('texts.folder.shareDisabled');
    const languageNames = new Intl.DisplayNames([locale], { type: 'language' });
    const source =
        languageNames.of(document.sourceLanguage) ?? document.sourceLanguage;
    const translation =
        languageNames.of(document.targetLanguage) ?? document.targetLanguage;
    const updated = t('texts.library.updated', {
        date: libraryRelativeTime(document.updatedAt, locale),
    });
    const menuLabel = t('texts.library.actions', { name: document.title });
    function rename() {
        onAction('rename', document);
    }
    function share() {
        onAction('share-text', document);
    }
    function archive() {
        onAction('archive-text', document);
    }
    function restore() {
        onRestore(document);
    }
    const items: MenuItem[] = [
        {
            label: t('texts.folder.rename'),
            icon: <PencilIcon className={styles.actionIcon} />,
            onSelect: rename,
        },
        {
            label: shareLabel,
            icon: <Share2Icon className={styles.actionIcon} />,
            onSelect: share,
            disabled: !canShare,
        },
        {
            label: t('texts.folder.archive'),
            icon: <ArchiveIcon className={styles.actionIcon} />,
            onSelect: archive,
            tone: 'danger',
            separatorBefore: true,
        },
    ];
    return (
        <li className={styles.row}>
            <div className={styles.rowCopy}>
                <h2 className={styles.rowTitle}>
                    {archived ? (
                        document.title
                    ) : (
                        <Link href={target} className={styles.rowLink}>
                            {document.title}
                        </Link>
                    )}
                </h2>
                <div className={styles.rowMeta}>
                    <span className={styles.languages}>
                        {source}
                        <ArrowRightIcon aria-hidden='true' />
                        {translation}
                    </span>
                    <TextStatusBadge status={document.status} />
                    {document.isShared && (
                        <Badge
                            size='sm'
                            tone='info'
                            icon={<Link2Icon className={styles.actionIcon} />}
                        >
                            {t('texts.folder.sharedBadge')}
                        </Badge>
                    )}
                    <span className={styles.updated}>{updated}</span>
                </div>
            </div>
            <div className={styles.rowActions}>
                {archived && !readOnly && (
                    <Button
                        variant='secondary'
                        size='compact'
                        leadingIcon={
                            <ArchiveRestoreIcon className={styles.actionIcon} />
                        }
                        disabled={pending}
                        onClick={restore}
                    >
                        {t('texts.library.restoreShort')}
                    </Button>
                )}
                {!archived && !readOnly && (
                    <Menu
                        iconOnly
                        label={menuLabel}
                        trigger={
                            <MoreHorizontalIcon className={styles.actionIcon} />
                        }
                        items={items}
                        triggerClassName={styles.menuTrigger}
                    />
                )}
            </div>
        </li>
    );
}
