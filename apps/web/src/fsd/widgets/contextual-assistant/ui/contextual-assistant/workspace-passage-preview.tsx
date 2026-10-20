import { TextQuote, X } from 'lucide-react';
import { conversationCopy } from '@/fsd/entities/conversation';
import { useI18n } from '@/fsd/shared/i18n';
import type { WorkspacePendingPassage } from '../../hooks/use-workspace-passage';
import styles from './composer.module.css';

export function WorkspacePassagePreview({
    passage,
    onRemove,
}: {
    passage: WorkspacePendingPassage;
    onRemove(): void;
}) {
    const { locale } = useI18n();
    const copy = conversationCopy(locale);
    const removeLabel = `${copy.remove}: ${copy.selection}`;
    return (
        <div className={styles.workspaceAttachment} data-passage='true'>
            <TextQuote size={16} aria-hidden='true' />
            <div className={styles.workspacePassageBody}>
                <span>{copy.selection}</span>
                <span className={styles.workspaceExcerpt} dir='auto'>
                    {passage.content}
                </span>
            </div>
            <button
                type='button'
                className={styles.removeAttachment}
                onClick={onRemove}
                aria-label={removeLabel}
            >
                <X size={14} aria-hidden='true' />
            </button>
        </div>
    );
}
