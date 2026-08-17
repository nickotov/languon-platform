'use client';

import {
    type ChangeEvent,
    type InputHTMLAttributes,
    type KeyboardEvent,
    useId,
    useState,
} from 'react';

import styles from './combobox.module.css';

export type ComboboxOption = { label: string; value: string };

export function Combobox({
    defaultValue = '',
    emptyMessage = 'No options found',
    loading = false,
    loadingMessage = 'Loading options',
    onValueChange,
    options,
    value,
    ...props
}: Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'defaultValue' | 'list' | 'onChange' | 'role' | 'value'
> & {
    defaultValue?: string;
    emptyMessage?: string;
    loading?: boolean;
    loadingMessage?: string;
    onValueChange?(value: string): void;
    options: ComboboxOption[];
    value?: string;
}) {
    const listId = useId();
    const [internalValue, setInternalValue] = useState(defaultValue);
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const query = value ?? internalValue;
    const matches = options.filter((option) =>
        `${option.label} ${option.value}`
            .toLocaleLowerCase()
            .includes(query.toLocaleLowerCase()),
    );
    const activeOption = matches[activeIndex];

    function update(next: string) {
        if (value === undefined) setInternalValue(next);
        onValueChange?.(next);
    }

    function change(event: ChangeEvent<HTMLInputElement>) {
        update(event.currentTarget.value);
        setActiveIndex(0);
        setOpen(true);
    }

    function select(option: ComboboxOption) {
        update(option.value);
        setOpen(false);
    }

    function keyDown(event: KeyboardEvent<HTMLInputElement>) {
        if (event.key === 'Escape') {
            setOpen(false);
            return;
        }
        if (event.key === 'Enter' && open && activeOption) {
            event.preventDefault();
            select(activeOption);
            return;
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key))
            return;
        event.preventDefault();
        setOpen(true);
        if (matches.length === 0) return;
        setActiveIndex((current) =>
            event.key === 'ArrowDown'
                ? (current + 1) % matches.length
                : event.key === 'ArrowUp'
                  ? (current - 1 + matches.length) % matches.length
                  : event.key === 'Home'
                    ? 0
                    : matches.length - 1,
        );
    }

    return (
        <div className={styles.root}>
            <input
                {...props}
                aria-activedescendant={
                    open && !loading && activeOption
                        ? `${listId}-option-${activeIndex}`
                        : undefined
                }
                aria-autocomplete='list'
                aria-busy={loading || undefined}
                aria-controls={listId}
                aria-expanded={open}
                className={styles.input}
                onBlur={() => setOpen(false)}
                onChange={change}
                onFocus={() => setOpen(true)}
                onKeyDown={keyDown}
                role='combobox'
                value={query}
            />
            {open ? (
                <div className={styles.listbox} id={listId} role='listbox'>
                    {loading ? (
                        <div
                            aria-disabled='true'
                            className={styles.message}
                            id={`${listId}-loading`}
                            role='option'
                        >
                            {loadingMessage}
                        </div>
                    ) : matches.length === 0 ? (
                        <div
                            aria-disabled='true'
                            className={styles.message}
                            role='option'
                        >
                            {emptyMessage}
                        </div>
                    ) : (
                        matches.map((option, index) => (
                            <div
                                aria-selected={index === activeIndex}
                                className={styles.option}
                                id={`${listId}-option-${index}`}
                                key={option.value}
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    select(option);
                                }}
                                onMouseEnter={() => setActiveIndex(index)}
                                role='option'
                            >
                                {option.label}
                            </div>
                        ))
                    )}
                </div>
            ) : null}
        </div>
    );
}
