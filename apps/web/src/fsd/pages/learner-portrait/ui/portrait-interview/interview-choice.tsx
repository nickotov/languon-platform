import type { ChangeEventHandler } from 'react';
import { Check, Plus } from 'lucide-react';
import styles from './portrait-interview.module.css';
export function InterviewChoice({
    label,
    name,
    value,
    checked,
    multiple = false,
    disabled = false,
    onChange,
}: {
    label: string;
    name: string;
    value: string;
    checked: boolean;
    multiple?: boolean;
    disabled?: boolean;
    onChange: ChangeEventHandler<HTMLInputElement>;
}) {
    return (
        <label className={styles.choice}>
            <input
                type={multiple ? 'checkbox' : 'radio'}
                name={name}
                value={value}
                checked={checked}
                onChange={onChange}
                disabled={disabled}
            />
            <span>
                <Plus className={styles.choicePlus} size={16} aria-hidden />
                <Check className={styles.choiceCheck} size={16} aria-hidden />
                {label}
            </span>
        </label>
    );
}
