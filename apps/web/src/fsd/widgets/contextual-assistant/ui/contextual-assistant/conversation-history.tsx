import { ArrowLeft, MessageSquare, SquarePen, Trash2 } from 'lucide-react';
import { conversationCopy } from '@/fsd/entities/conversation';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, IconButton } from '@/fsd/shared/ui';
import { ConversationDeleteConfirmation } from './conversation-delete-confirmation';
import styles from './conversation-history.module.css';

const labels = {
    en: {
        back: 'Back to chat',
        here: 'This page',
        empty: 'No conversations about this page yet.',
        fresh: 'New',
    },
    ru: {
        back: 'Назад в чат',
        here: 'Эта страница',
        empty: 'Об этой странице пока нет бесед.',
        fresh: 'Новая',
    },
    es: {
        back: 'Volver al chat',
        here: 'Esta página',
        empty: 'Aún no hay conversaciones sobre esta página.',
        fresh: 'Nueva',
    },
    fr: {
        back: 'Retour au chat',
        here: 'Cette page',
        empty: 'Aucune conversation sur cette page.',
        fresh: 'Nouvelle',
    },
};

export function ConversationHistory({
    id,
    options,
    busy,
    sourceLabel,
    onSelect,
    onCreate,
    onDelete,
    onBack,
    deleting,
    onConfirmDelete,
    onCancelDelete,
    deletingPending = false,
}: {
    id: string | null;
    options: { value: string; label: string; date: string }[];
    sourceLabel?: string | undefined;
    busy: boolean;
    onSelect(id: string): void;
    onCreate(): void;
    onDelete(id: string): void;
    onBack(): void;
    deleting?: string | null | undefined;
    deletingPending?: boolean;
    onConfirmDelete?: (() => void) | undefined;
    onCancelDelete?: (() => void) | undefined;
}) {
    const { locale } = useI18n();
    const copy = labels[locale];
    const title = `${copy.here}${sourceLabel ? ` · ${sourceLabel}` : ''}`;
    return (
        <section className={styles.history}>
            <div className={styles.toolbar}>
                <Button
                    variant='ghost'
                    size='compact'
                    leadingIcon={<ArrowLeft size={16} />}
                    onClick={onBack}
                    disabled={deletingPending}
                >
                    {copy.back}
                </Button>
                <Button
                    variant='secondary'
                    size='compact'
                    leadingIcon={<SquarePen size={16} />}
                    onClick={onCreate}
                    disabled={busy}
                >
                    {copy.fresh}
                </Button>
            </div>
            <div className={styles.list}>
                <h3 className={styles.heading}>{title}</h3>
                {options.length === 0 && (
                    <p className={styles.empty}>{copy.empty}</p>
                )}
                <ul>
                    {options.map((option) => {
                        if (
                            deleting === option.value &&
                            onConfirmDelete &&
                            onCancelDelete
                        )
                            return (
                                <li key={option.value}>
                                    <ConversationDeleteConfirmation
                                        title={option.label}
                                        pending={deletingPending}
                                        onConfirm={onConfirmDelete}
                                        onCancel={onCancelDelete}
                                    />
                                </li>
                            );
                        return (
                            <HistoryRow
                                key={option.value}
                                option={option}
                                active={id === option.value}
                                busy={busy}
                                onSelect={onSelect}
                                onDelete={onDelete}
                            />
                        );
                    })}
                </ul>
            </div>
        </section>
    );
}

function HistoryRow({
    option,
    active,
    busy,
    onSelect,
    onDelete,
}: {
    option: { value: string; label: string; date: string };
    active: boolean;
    busy: boolean;
    onSelect(id: string): void;
    onDelete(id: string): void;
}) {
    const { locale } = useI18n();
    const copy = conversationCopy(locale);
    const rowClass = [styles.row, active ? styles.active : ''].join(' ');
    const deleteLabel = `${copy.deleteChat}: ${option.label}`;
    function select() {
        onSelect(option.value);
    }
    function remove() {
        onDelete(option.value);
    }
    return (
        <li className={rowClass}>
            <button
                type='button'
                className={styles.select}
                aria-current={active || undefined}
                disabled={busy}
                onClick={select}
            >
                <MessageSquare aria-hidden size={16} />
                <span>
                    <span className={styles.title}>{option.label}</span>
                    <span className={styles.date}>{option.date}</span>
                </span>
            </button>
            <IconButton
                className={styles.delete}
                icon={<Trash2 />}
                label={deleteLabel}
                size='sm'
                variant='ghost'
                showTooltip={false}
                onClick={remove}
                disabled={busy}
            />
        </li>
    );
}
