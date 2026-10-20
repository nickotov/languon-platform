import { Copy, History, Trash2 } from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import { Button } from '@/fsd/shared/ui';
import styles from './knowledge-detail-page.module.css';

export function WorkspaceHeader({
    title,
    recovery,
    draft,
    canSave,
    busy,
    onSaveCopy,
    onHistory,
    onDelete,
}: {
    title: string;
    recovery: 'saved' | 'saving' | 'unsaved' | 'error' | 'conflict';
    draft: boolean;
    canSave: boolean;
    busy: 'save' | 'copy' | 'delete' | 'resolve' | null;
    onSaveCopy(): void;
    onHistory(): void;
    onDelete(): void;
}) {
    const { t } = useI18n();
    return (
        <header className={styles.header}>
            <div>
                <p className={styles.eyebrow}>{t('knowledge.workspace')}</p>
                <h1 dir='auto'>{title}</h1>
                <p className={styles.recovery} role='status'>
                    {t(`knowledge.recovery.${recovery}`)}
                </p>
            </div>
            <div className={styles.actions}>
                <Button
                    variant='secondary'
                    leadingIcon={<Copy aria-hidden size={18} />}
                    disabled={!canSave || busy !== null}
                    loading={busy === 'copy'}
                    onClick={onSaveCopy}
                >
                    {t('knowledge.saveCopy')}
                </Button>
                <Button
                    variant='ghost'
                    leadingIcon={<History aria-hidden size={18} />}
                    disabled={draft || busy !== null}
                    onClick={onHistory}
                >
                    {t('knowledge.history')}
                </Button>
                <Button
                    variant='ghost'
                    leadingIcon={<Trash2 aria-hidden size={18} />}
                    disabled={busy !== null}
                    onClick={onDelete}
                >
                    {t('knowledge.delete')}
                </Button>
            </div>
        </header>
    );
}
