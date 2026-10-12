import styles from './field-group.module.css';
import { useId } from 'react';
import { useI18n } from '@/fsd/shared/i18n';
import { Checkbox } from '@/fsd/shared/ui';
import { FIELD_ORDER, orderFields } from '../../lib/flashcard-fields';
import type { Field } from '../../types';

export function FieldGroup({
    side,
    selected,
    onChange,
    invalid,
    disabled,
}: {
    side: 'front' | 'back';
    selected: Field[];
    onChange(fields: Field[]): void;
    invalid: boolean;
    disabled: boolean;
}) {
    const { t } = useI18n();

    const errorId = useId();

    const ordered = orderFields(selected)
        .map((field) => t(`training.field.${field}`))
        .join(' · ');

    const summary = t('training.shownOrder', { fields: ordered });

    return (
        <fieldset
            disabled={disabled}
            aria-describedby={invalid ? errorId : undefined}
            className={styles.group}
        >
            <legend className={styles.legend}>{t(`training.${side}`)}</legend>
            <div className={styles.fields}>
                {FIELD_ORDER.map((field) => (
                    <FieldChoice
                        key={field}
                        field={field}
                        selected={selected}
                        onChange={onChange}
                        side={side}
                    />
                ))}
            </div>
            {ordered && <p className={styles.summary}>{summary}</p>}
            {invalid && (
                <p id={errorId} role='alert' className={styles.error}>
                    {t('training.chooseField')}
                </p>
            )}
        </fieldset>
    );
}

function FieldChoice({
    field,
    selected,
    onChange,
    side,
}: {
    field: Field;
    selected: Field[];
    onChange(fields: Field[]): void;
    side: string;
}) {
    const { t } = useI18n();

    const checked = selected.includes(field);

    function handleChange() {
        onChange(
            checked
                ? selected.filter((value) => value !== field)
                : [...selected, field],
        );
    }

    return (
        <Checkbox
            name={side}
            label={t(`training.field.${field}`)}
            checked={checked}
            onChange={handleChange}
        />
    );
}
