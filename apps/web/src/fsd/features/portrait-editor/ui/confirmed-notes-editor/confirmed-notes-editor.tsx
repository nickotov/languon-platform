'use client';

import { Trash2 } from 'lucide-react';
import type { PortraitItems } from '@languon/contracts';
import type { Locale } from '@/fsd/shared/i18n';
import { IconButton } from '@/fsd/shared/ui';
import { copy, labels } from '../../lib/copy';
import { EditorSection } from '../editor-controls/editor-controls';
import { ShortTextInput } from '../short-text-input/short-text-input';
import styles from '../common.module.css';

type Note = NonNullable<PortraitItems['notes']>[number];

function NoteRow({
    note,
    onChange,
    onRemove,
    locale,
    disabled,
}: {
    note: Note;
    onChange: (note: Note) => void;
    onRemove: (id: string) => void;
    locale: Locale;
    disabled: boolean;
}) {
    const topicLabels = {
        languages: labels[locale].languages,
        'explanation-languages': labels[locale].explanation,
        goals: labels[locale].goals,
        style: labels[locale].style,
        accommodations: labels[locale].accommodations,
        hobbies: labels[locale].hobbies,
        age: labels[locale].age,
        update: copy(
            locale,
            'Update',
            'Обновление',
            'Mise à jour',
            'Actualización',
        ),
    };
    const label = `${copy(locale, 'Note', 'Заметка', 'Note', 'Nota')} · ${topicLabels[note.topic]}`;
    const removeLabel = copy(
        locale,
        'Remove note',
        'Удалить заметку',
        'Supprimer la note',
        'Eliminar nota',
    );
    function handleChange(text: string) {
        onChange({ ...note, text });
    }
    function handleRemove() {
        onRemove(note.id);
    }
    return (
        <li className={styles.noteRow}>
            <ShortTextInput
                label={label}
                value={note.text}
                onChange={handleChange}
                locale={locale}
                disabled={disabled}
            />
            <IconButton
                className={styles.noteRemove}
                label={removeLabel}
                icon={<Trash2 />}
                variant='ghost'
                onClick={handleRemove}
                disabled={disabled}
            />
        </li>
    );
}

export function ConfirmedNotesEditor({
    items,
    onChange,
    locale,
    disabled = false,
}: {
    items: PortraitItems;
    onChange: (items: PortraitItems) => void;
    locale: Locale;
    disabled?: boolean;
}) {
    const notes = items.notes ?? [];
    if (notes.length === 0) return null;
    const title = copy(
        locale,
        'Confirmed notes',
        'Подтверждённые заметки',
        'Notes confirmées',
        'Notas confirmadas',
    );
    const description = copy(
        locale,
        'Notes you added from the interview chat.',
        'Заметки, которые вы подтвердили в интервью.',
        'Les notes que vous avez confirmées dans l’entretien.',
        'Notas que confirmaste en la entrevista.',
    );
    function handleChange(note: Note) {
        onChange({
            ...items,
            notes: notes.map((item) => (item.id === note.id ? note : item)),
        });
    }
    function handleRemove(id: string) {
        onChange({ ...items, notes: notes.filter((note) => note.id !== id) });
    }
    return (
        <EditorSection
            title={title}
            description={description}
            count={notes.length}
            locale={locale}
        >
            <ul className={styles.list}>
                {notes.map((note) => (
                    <NoteRow
                        key={note.id}
                        note={note}
                        onChange={handleChange}
                        onRemove={handleRemove}
                        locale={locale}
                        disabled={disabled}
                    />
                ))}
            </ul>
        </EditorSection>
    );
}
