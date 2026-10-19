import { conversationCopy } from '@/fsd/entities/conversation';
import { useI18n } from '@/fsd/shared/i18n';
import { Button } from '@/fsd/shared/ui';
import styles from './conversation-delete-confirmation.module.css';

export function ConversationDeleteConfirmation({
    onConfirm,
    onCancel,
    title,
    pending = false,
}: {
    onConfirm(): void;
    onCancel(): void;
    title?: string | undefined;
    pending?: boolean;
}) {
    const { locale } = useI18n();
    const copy = conversationCopy(locale);
    const heading = title
        ? `${copy.delete} “${title}”?`
        : `${copy.deleteChat}?`;
    return (
        <section
            className={styles.confirm}
            role='group'
            aria-busy={pending}
            aria-label={copy.deleteChat}
        >
            <strong>{heading}</strong>
            <p>{copy.confirmDelete}</p>
            <div className={styles.actions}>
                <Button
                    variant='danger'
                    size='compact'
                    onClick={onConfirm}
                    disabled={pending}
                    loading={pending}
                >
                    {copy.delete}
                </Button>
                <Button
                    variant='ghost'
                    size='compact'
                    onClick={onCancel}
                    disabled={pending}
                    autoFocus
                >
                    {copy.cancel}
                </Button>
            </div>
        </section>
    );
}
