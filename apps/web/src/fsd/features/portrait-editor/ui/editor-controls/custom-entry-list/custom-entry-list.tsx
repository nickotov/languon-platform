'use client';
import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { portraitCharacterCount } from '@languon/contracts';
import { Button } from '@/fsd/shared/ui';
import type { Locale } from '@/fsd/shared/i18n';
import { labels, copy } from '../../../lib/copy';
import styles from '../../styles/common-common.module.css';
import { ShortTextInput } from '../../short-text-input/short-text-input';

function RemovableEntry({
    entry,
    onRemove,
    locale,
    disabled = false,
}: {
    entry: string;
    onRemove: (value: string) => void;
    locale: Locale;
    disabled?: boolean;
}) {
    function handleRemove() {
        onRemove(entry);
    }

    const label = `${labels[locale].remove}: ${entry}`;
    const className = [styles.chip, styles.selected].join(' ');

    return (
        <li>
            <button
                type='button'
                className={className}
                onClick={handleRemove}
                aria-label={label}
                disabled={disabled}
            >
                {entry}
                <X className={styles.icon} aria-hidden='true' />
            </button>
        </li>
    );
}

export function CustomEntryList({
    label,
    entries,
    onChange,
    locale,
    disabled = false,
    max = 12,
    placeholder,
}: {
    label: string;
    entries: string[];
    onChange: (entries: string[]) => void;
    locale: Locale;
    disabled?: boolean;
    max?: number;
    placeholder?: string | undefined;
}) {
    const [draft, setDraft] = useState('');
    const duplicate = entries.some(
        (value) => value.toLowerCase() === draft.trim().toLowerCase(),
    );
    const atLimit = entries.length >= max;
    const invalid =
        disabled ||
        !draft.trim() ||
        portraitCharacterCount(draft) > 200 ||
        duplicate ||
        atLimit;

    function handleAdd() {
        if (invalid) {
            return;
        }

        onChange([...entries, draft.trim()]);
        setDraft('');
    }

    function handleRemove(value: string) {
        onChange(entries.filter((entry) => entry !== value));
    }

    const limitText = copy(
        locale,
        'Remove an item to add another.',
        'Удалите пункт, чтобы добавить новый.',
        'Supprimez un élément pour en ajouter un autre.',
        'Elimina un elemento para añadir otro.',
    );

    return (
        <div className={styles.stack}>
            {entries.length > 0 && (
                <ul className={styles.chips}>
                    {entries.map((entry) => (
                        <RemovableEntry
                            key={entry}
                            entry={entry}
                            onRemove={handleRemove}
                            locale={locale}
                            disabled={disabled}
                        />
                    ))}
                </ul>
            )}
            <div className={styles.inline}>
                <ShortTextInput
                    label={label}
                    placeholder={placeholder}
                    value={draft}
                    onChange={setDraft}
                    locale={locale}
                    onEnter={handleAdd}
                    disabled={disabled}
                />
                <Button
                    variant='secondary'
                    className={styles.addButton}
                    leadingIcon={<Plus className={styles.icon} />}
                    type='button'
                    onClick={handleAdd}
                    disabled={invalid}
                >
                    {labels[locale].add}
                </Button>
            </div>
            {atLimit && <p className={styles.description}>{limitText}</p>}
        </div>
    );
}
