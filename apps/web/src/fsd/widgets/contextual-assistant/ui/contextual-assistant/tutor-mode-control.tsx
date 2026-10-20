import {
    useId,
    type ChangeEvent,
    type MouseEvent,
    type KeyboardEvent,
} from 'react';
import type { ChatPreferences } from '@languon/contracts';
import { useI18n } from '@/fsd/shared/i18n';
import { tutorModeCopy } from './tutor-mode-copy';
import styles from './tutor-mode-control.module.css';

const modes = ['auto', 'explain', 'correct', 'practice'] as const;

/** Controlled by the saved conversation preferences; a failed write keeps the previous selection. */
export function TutorModeControl({
    value,
    onChange,
    disabled,
}: {
    value: ChatPreferences;
    onChange(value: ChatPreferences): void;
    disabled: boolean;
}) {
    const { locale } = useI18n();
    const copy = tutorModeCopy(locale);
    const name = useId();
    const legendId = `${name}-label`;
    function choose(event: ChangeEvent<HTMLInputElement>) {
        if (disabled) return;
        onChange({
            ...value,
            mode: event.currentTarget.value as ChatPreferences['mode'],
        });
    }
    function guardClick(event: MouseEvent<HTMLInputElement>) {
        if (disabled) event.preventDefault();
    }
    function guardKey(event: KeyboardEvent<HTMLInputElement>) {
        if (disabled && (event.key.startsWith('Arrow') || event.key === ' '))
            event.preventDefault();
    }
    return (
        <fieldset
            className={styles.group}
            aria-disabled={disabled}
            role='radiogroup'
            aria-labelledby={legendId}
        >
            <legend id={legendId}>{copy.label}</legend>
            <div className={styles.options}>
                {modes.map((mode) => (
                    <label key={mode} className={styles.option}>
                        <input
                            type='radio'
                            name={name}
                            value={mode}
                            checked={value.mode === mode}
                            onChange={choose}
                            onClick={guardClick}
                            onKeyDown={guardKey}
                            aria-disabled={disabled}
                        />
                        <span>{copy[mode]}</span>
                    </label>
                ))}
            </div>
        </fieldset>
    );
}
