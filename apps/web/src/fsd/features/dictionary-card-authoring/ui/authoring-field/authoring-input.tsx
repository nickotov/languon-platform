import type { ChangeEvent } from 'react';
import { Input, Textarea } from '@/fsd/shared/ui';
import styles from '../dictionary-card-form-common.module.css';

export function AuthoringInput({
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    'data-validation': dataValidation,
    id,
    direction,
    disabled,
    inputLimit,
    language,
    multiline,
    onChange,
    required,
    value,
}: {
    'aria-describedby'?: string;
    'aria-invalid'?: boolean;
    'data-validation'?: 'success';
    id?: string;
    direction: 'ltr' | 'rtl';
    disabled: boolean;
    inputLimit: number;
    language: string;
    multiline: boolean;
    onChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void;
    required: boolean;
    value: string;
}) {
    if (multiline) {
        return (
            <Textarea
                className={styles.textarea}
                aria-describedby={ariaDescribedBy}
                aria-invalid={ariaInvalid}
                data-validation={dataValidation}
                id={id}
                disabled={disabled}
                rows={2}
                dir={direction}
                lang={language}
                maxLength={inputLimit}
                onChange={onChange}
                value={value}
            />
        );
    }

    return (
        <Input
            aria-describedby={ariaDescribedBy}
            aria-invalid={ariaInvalid}
            data-validation={dataValidation}
            id={id}
            disabled={disabled}
            dir={direction}
            lang={language}
            maxLength={inputLimit}
            required={required}
            onChange={onChange}
            value={value}
        />
    );
}
