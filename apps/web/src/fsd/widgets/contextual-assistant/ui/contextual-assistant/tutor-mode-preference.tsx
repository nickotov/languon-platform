import { ChevronDown } from 'lucide-react';
import type { ChatPreferences } from '@languon/contracts';
import { conversationCopy } from '@/fsd/entities/conversation';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Popover,
    PopoverContent,
    PopoverSeparator,
    PopoverTrigger,
} from '@/fsd/shared/ui';
import { TutorModeControl } from './tutor-mode-control';
import { tutorModeCopy } from './tutor-mode-copy';
import { composerCopy } from './composer-copy';
import styles from './composer.module.css';

export function TutorModePreference({
    value,
    onChange,
    onDefaults,
    disabled,
}: {
    value: ChatPreferences;
    onChange(value: ChatPreferences): void;
    onDefaults(): void;
    disabled: boolean;
}) {
    const { locale } = useI18n();
    const copy = tutorModeCopy(locale);
    const existing = conversationCopy(locale);
    const text = composerCopy(locale);
    const label = `${copy.label}: ${copy[value.mode]}`;
    function saveDefaults() {
        if (!disabled) onDefaults();
    }
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type='button'
                    className={styles.chip}
                    aria-label={label}
                    disabled={disabled}
                >
                    <span>{copy.label}</span>
                    <strong>{copy[value.mode]}</strong>
                    <ChevronDown size={12} aria-hidden='true' />
                </button>
            </PopoverTrigger>
            <PopoverContent
                side='top'
                align='start'
                className={styles.preferencePopover}
            >
                <TutorModeControl
                    value={value}
                    onChange={onChange}
                    disabled={disabled}
                />
                <PopoverSeparator />
                <div className={styles.defaults}>
                    <span>{text.conversationOnly}</span>
                    <button
                        type='button'
                        onClick={saveDefaults}
                        aria-disabled={disabled}
                    >
                        {existing.defaults}
                    </button>
                </div>
            </PopoverContent>
        </Popover>
    );
}
