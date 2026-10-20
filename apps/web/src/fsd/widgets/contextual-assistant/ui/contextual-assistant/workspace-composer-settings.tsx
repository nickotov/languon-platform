import { SlidersHorizontal, Check } from 'lucide-react';
import {
    useId,
    type ChangeEvent,
    type ReactNode,
    type MouseEvent,
    type KeyboardEvent,
} from 'react';
import type { ChatPreferences } from '@languon/contracts';
import { conversationCopy } from '@/fsd/entities/conversation';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
    Tooltip,
} from '@/fsd/shared/ui';
import { TutorModeControl } from './tutor-mode-control';
import { workspaceCopy } from '../../lib/workspace-copy';
import { composerCopy } from './composer-copy';
import styles from './composer.module.css';

type Option = { value: string; label: string; description?: string };
export function WorkspaceComposerSettings({
    value,
    onChange,
    onDefaults,
    disabled,
    defaultsSaved,
    languageOptions,
    tones,
    levels,
    modelControl,
}: {
    value: ChatPreferences;
    onChange(value: ChatPreferences): void;
    onDefaults(): void;
    disabled: boolean;
    defaultsSaved: boolean;
    languageOptions: Option[];
    tones: Option[];
    levels: Option[];
    modelControl?: ReactNode;
}) {
    const { locale } = useI18n();
    const copy = conversationCopy(locale);
    const text = composerCopy(locale);
    const workspace = workspaceCopy(locale);
    const id = useId();
    function language(event: ChangeEvent<HTMLSelectElement>) {
        if (disabled) return;
        onChange({ ...value, replyLanguage: event.target.value });
    }
    function tone(next: string) {
        if (disabled) return;
        onChange({ ...value, tone: next as ChatPreferences['tone'] });
    }
    function level(next: string) {
        if (disabled) return;
        onChange({
            ...value,
            explanationLevel: next as ChatPreferences['explanationLevel'],
        });
    }
    function saveDefaults() {
        if (!disabled) onDefaults();
    }
    function guardSelectClick(event: MouseEvent<HTMLSelectElement>) {
        if (disabled) event.preventDefault();
    }
    function guardSelectKey(event: KeyboardEvent<HTMLSelectElement>) {
        if (disabled && event.key !== 'Tab' && event.key !== 'Escape')
            event.preventDefault();
    }
    return (
        <Popover>
            <Tooltip content={workspace.settings} placement='top'>
                <PopoverTrigger asChild>
                    <button
                        type='button'
                        className={styles.settingsTrigger}
                        aria-label={workspace.settings}
                        disabled={disabled}
                    >
                        <SlidersHorizontal size={16} aria-hidden='true' />
                    </button>
                </PopoverTrigger>
            </Tooltip>
            <PopoverContent
                side='top'
                align='start'
                className={styles.workspaceSettings}
            >
                <header className={styles.settingsHeader}>
                    <strong>{workspace.settings}</strong>
                    <p>{text.conversationOnly}</p>
                </header>
                <div className={styles.settingsBody}>
                    <TutorModeControl
                        value={value}
                        onChange={onChange}
                        disabled={disabled}
                    />
                    <label className={styles.languageSetting} htmlFor={id}>
                        {copy.language}
                        <select
                            id={id}
                            value={value.replyLanguage}
                            onChange={language}
                            aria-disabled={disabled}
                            onMouseDown={guardSelectClick}
                            onKeyDown={guardSelectKey}
                        >
                            {languageOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </label>
                    <SettingsGroup
                        label={copy.tone}
                        options={tones}
                        value={value.tone}
                        onChange={tone}
                        disabled={disabled}
                    />
                    <SettingsGroup
                        label={copy.level}
                        options={levels}
                        value={value.explanationLevel}
                        onChange={level}
                        disabled={disabled}
                    />
                    <section className={styles.contextSetting}>
                        <strong>{workspace.document}</strong>
                        <p>{workspace.context}</p>
                        <small>{workspace.hint}</small>
                    </section>
                    {modelControl}
                </div>
                <footer className={styles.settingsFooter}>
                    <button
                        type='button'
                        onClick={saveDefaults}
                        aria-disabled={disabled}
                    >
                        {copy.defaults}
                    </button>
                    {defaultsSaved && (
                        <p role='status'>
                            <Check size={14} aria-hidden='true' />
                            {copy.saved}
                        </p>
                    )}
                </footer>
            </PopoverContent>
        </Popover>
    );
}
function SettingsGroup({
    label,
    options,
    value,
    onChange,
    disabled,
}: {
    label: string;
    options: Option[];
    value: string;
    onChange(value: string): void;
    disabled: boolean;
}) {
    return (
        <fieldset className={styles.settingsGroup}>
            <legend>{label}</legend>
            <div>
                {options.map((option) => (
                    <SettingOption
                        key={option.value}
                        option={option}
                        selected={value === option.value}
                        onChange={onChange}
                        disabled={disabled}
                    />
                ))}
            </div>
        </fieldset>
    );
}
function SettingOption({
    option,
    selected,
    onChange,
    disabled,
}: {
    option: Option;
    selected: boolean;
    onChange(value: string): void;
    disabled: boolean;
}) {
    function choose() {
        if (!disabled) onChange(option.value);
    }
    return (
        <button
            type='button'
            aria-pressed={selected}
            onClick={choose}
            aria-disabled={disabled}
            title={option.description}
        >
            {option.label}
        </button>
    );
}
