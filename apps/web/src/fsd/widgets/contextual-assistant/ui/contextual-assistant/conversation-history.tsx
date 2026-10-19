import type { ChangeEvent } from 'react';
import { conversationCopy } from '@/fsd/entities/conversation';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, Select } from '@/fsd/shared/ui';
import styles from './contextual-assistant.module.css';

export function ConversationHistory({
    id,
    options,
    busy,
    onSelect,
    onCreate,
    onDelete,
}: {
    id: string | null;
    options: { value: string; label: string }[];
    busy: boolean;
    onSelect(event: ChangeEvent<HTMLSelectElement>): void;
    onCreate(): void;
    onDelete(): void;
}) {
    const { locale } = useI18n();
    const copy = conversationCopy(locale);
    return (
        <div className={styles.toolbar}>
            {id && (
                <Select
                    containerClassName={styles.history!}
                    label={copy.history}
                    options={options}
                    value={id}
                    onChange={onSelect}
                />
            )}
            <Button variant='secondary' onClick={onCreate} disabled={busy}>
                {copy.newChat}
            </Button>
            {id && (
                <Button variant='quiet' onClick={onDelete}>
                    {copy.deleteChat}
                </Button>
            )}
        </div>
    );
}
