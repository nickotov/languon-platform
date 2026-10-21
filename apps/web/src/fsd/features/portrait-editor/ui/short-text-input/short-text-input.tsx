'use client';
import { useId, type ChangeEvent, type KeyboardEvent } from 'react';
import { portraitCharacterCount } from '@languon/contracts';
import { Input } from '@/fsd/shared/ui';
import type { Locale } from '@/fsd/shared/i18n';
import { copy } from '../../lib/copy';
import styles from '../common.module.css';
export function ShortTextInput({
    label,
    value,
    onChange,
    locale,
    disabled = false,
    onEnter,
    placeholder,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    locale: Locale;
    disabled?: boolean;
    onEnter?: () => void;
    placeholder?: string | undefined;
}) {
    const id = useId();
    const count = portraitCharacterCount(value);
    const error =
        count > 200
            ? copy(
                  locale,
                  'Use at most 200 characters.',
                  'Не более 200 символов.',
                  '200 caractères maximum.',
                  'Máximo 200 caracteres.',
              )
            : undefined;
    function handleChange(event: ChangeEvent<HTMLInputElement>) {
        onChange(event.target.value);
    }
    function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
        if (event.key === 'Enter' && onEnter) {
            event.preventDefault();
            if (!error) onEnter();
        }
    }
    const errorProps = error ? { error } : {};
    return (
        <div className={styles.grow}>
            <Input
                label={label}
                value={value}
                placeholder={placeholder}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                {...errorProps}
                aria-describedby={id}
            />
            <span className={styles.counter} id={id}>
                {count} / 200
            </span>
        </div>
    );
}
