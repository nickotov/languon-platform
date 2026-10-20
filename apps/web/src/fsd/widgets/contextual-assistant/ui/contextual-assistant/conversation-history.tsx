import {
    useRef,
    useState,
    type ChangeEvent,
    type FormEvent,
    type KeyboardEvent,
} from 'react';
import {
    ArrowLeft,
    Check,
    MessageSquare,
    Pencil,
    SquarePen,
    Trash2,
    X,
} from 'lucide-react';
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
        rename: 'Rename conversation',
        save: 'Save title',
        cancel: 'Cancel rename',
        renameError: 'Could not save the title. Your edit is still here.',
    },
    ru: {
        back: 'Назад в чат',
        here: 'Эта страница',
        empty: 'Об этой странице пока нет бесед.',
        fresh: 'Новая',
        rename: 'Переименовать беседу',
        save: 'Сохранить название',
        cancel: 'Отменить переименование',
        renameError: 'Не удалось сохранить название. Ваш текст сохранён здесь.',
    },
    es: {
        back: 'Volver al chat',
        here: 'Esta página',
        empty: 'Aún no hay conversaciones sobre esta página.',
        fresh: 'Nueva',
        rename: 'Cambiar nombre de la conversación',
        save: 'Guardar título',
        cancel: 'Cancelar cambio',
        renameError: 'No se pudo guardar el título. Tu edición sigue aquí.',
    },
    fr: {
        back: 'Retour au chat',
        here: 'Cette page',
        empty: 'Aucune conversation sur cette page.',
        fresh: 'Nouvelle',
        rename: 'Renommer la conversation',
        save: 'Enregistrer le titre',
        cancel: 'Annuler',
        renameError:
            'Impossible d’enregistrer le titre. Votre saisie est conservée.',
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
    onRename,
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
    onRename(id: string, title: string): Promise<void>;
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
                                onRename={onRename}
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
    onRename,
}: {
    option: { value: string; label: string; date: string };
    active: boolean;
    busy: boolean;
    onSelect(id: string): void;
    onDelete(id: string): void;
    onRename(id: string, title: string): Promise<void>;
}) {
    const { locale } = useI18n();
    const copy = conversationCopy(locale);
    const text = labels[locale];
    const [editing, setEditing] = useState(false);
    const [title, setTitle] = useState(option.label);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState(false);
    const renameButton = useRef<HTMLButtonElement>(null);
    const rowClass = [styles.row, active ? styles.active : ''].join(' ');
    const deleteLabel = `${copy.deleteChat}: ${option.label}`;
    function select() {
        onSelect(option.value);
    }
    function remove() {
        onDelete(option.value);
    }
    function startEdit() {
        setTitle(option.label);
        setError(false);
        setEditing(true);
    }
    function change(event: ChangeEvent<HTMLInputElement>) {
        setTitle(event.target.value);
        setError(false);
    }
    function cancel() {
        setEditing(false);
        setError(false);
        requestAnimationFrame(() => renameButton.current?.focus());
    }
    function editKey(event: KeyboardEvent<HTMLInputElement>) {
        if (event.key === 'Escape') {
            event.preventDefault();
            cancel();
        }
    }
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const next = title.trim();
        if (!next || next.length > 200 || pending) return;
        setPending(true);
        try {
            await onRename(option.value, next);
            setEditing(false);
            setError(false);
            requestAnimationFrame(() => renameButton.current?.focus());
        } catch {
            setError(true);
        } finally {
            setPending(false);
        }
    }
    return (
        <li className={rowClass}>
            {editing ? (
                <form className={styles.renameForm} onSubmit={submit}>
                    <input
                        autoFocus
                        aria-label={text.rename}
                        value={title}
                        onChange={change}
                        onKeyDown={editKey}
                        maxLength={200}
                        disabled={pending}
                    />
                    <IconButton
                        icon={<Check />}
                        label={text.save}
                        size='sm'
                        variant='ghost'
                        type='submit'
                        disabled={pending || !title.trim()}
                    />
                    <IconButton
                        icon={<X />}
                        label={text.cancel}
                        size='sm'
                        variant='ghost'
                        onClick={cancel}
                        disabled={pending}
                    />
                    {error && (
                        <span role='alert' className={styles.renameError}>
                            {text.renameError}
                        </span>
                    )}
                </form>
            ) : (
                <>
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
                        ref={renameButton}
                        className={styles.rename}
                        icon={<Pencil />}
                        label={`${text.rename}: ${option.label}`}
                        size='sm'
                        variant='ghost'
                        showTooltip={false}
                        onClick={startEdit}
                        disabled={busy}
                    />
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
                </>
            )}
        </li>
    );
}
