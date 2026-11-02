import type { ChangeEvent } from 'react';
import styles from './library-copy.module.css';

export function LibraryEntrySelection({
    entries,
    selected,
    label,
    onChange,
}: {
    entries: { id: string; term: string; translation: string }[];
    selected: string[];
    label: string;
    onChange(event: ChangeEvent<HTMLInputElement>): void;
}) {
    return (
        <fieldset className={styles.entries}>
            <legend>{label}</legend>
            {entries.map((entry) => (
                <label key={entry.id} className={styles.entry}>
                    <input
                        type='checkbox'
                        value={entry.id}
                        checked={selected.includes(entry.id)}
                        onChange={onChange}
                    />
                    {entry.term} — {entry.translation}
                </label>
            ))}
        </fieldset>
    );
}
