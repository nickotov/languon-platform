import { TextQuote } from 'lucide-react';
import { conversationCopy } from '@/fsd/entities/conversation';
import { useI18n } from '@/fsd/shared/i18n';
import styles from '../../../styles/contextual-assistant-workspace-message-materials-common.module.css';

export function WorkspaceMessagePassage({ content }: { content: string }) {
    const { locale } = useI18n();
    const copy = conversationCopy(locale);

    return (
        <details className={styles.material}>
            <summary>
                <span className={styles.label}>
                    <TextQuote size={14} aria-hidden='true' />
                    {copy.selection}
                </span>
                <span className={styles.excerpt} dir='auto'>
                    {content}
                </span>
            </summary>
            <div className={styles.full} dir='auto'>
                {content}
            </div>
        </details>
    );
}
