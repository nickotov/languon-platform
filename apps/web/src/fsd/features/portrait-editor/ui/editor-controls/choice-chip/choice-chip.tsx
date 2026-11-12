'use client';
import { Check, Plus } from 'lucide-react';
import styles from '../../styles/common-common.module.css';

export function ChoiceChip({
    value,
    label,
    selected,
    disabled = false,
    onToggle,
}: {
    value: string;
    label: string;
    selected: boolean;
    disabled?: boolean;
    onToggle: (value: string) => void;
}) {
    function handleToggle() {
        onToggle(value);
    }

    const className = [styles.chip, selected ? styles.selected : ''].join(' ');
    const Icon = selected ? Check : Plus;

    return (
        <button
            className={className}
            type='button'
            aria-pressed={selected}
            disabled={disabled}
            onClick={handleToggle}
        >
            <Icon className={styles.icon} aria-hidden='true' />
            {label}
        </button>
    );
}
