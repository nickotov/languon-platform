import type { ReactNode } from 'react';
import styles from './radio-group.module.css';
export function RadioGroup({
    defaultValue,
    legend,
    name,
    options,
}: {
    defaultValue?: string;
    legend: string;
    name: string;
    options: { disabled?: boolean; label: ReactNode; value: string }[];
}) {
    return (
        <fieldset className={styles.group}>
            <legend>{legend}</legend>
            {options.map((option) => (
                <label className={styles.choice} key={option.value}>
                    <input
                        defaultChecked={option.value === defaultValue}
                        disabled={option.disabled}
                        name={name}
                        type='radio'
                        value={option.value}
                    />
                    {option.label}
                </label>
            ))}
        </fieldset>
    );
}
