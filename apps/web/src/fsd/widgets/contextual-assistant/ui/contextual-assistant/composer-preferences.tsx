import { useQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import type { ChatPreferences } from '@languon/contracts';
import { dictionaryApi, languageLabel } from '@/fsd/entities/dictionary';
import { conversationCopy } from '@/fsd/entities/conversation';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Popover,
    PopoverContent,
    PopoverHeader,
    PopoverItem,
    PopoverSeparator,
    PopoverTrigger,
} from '@/fsd/shared/ui';
import { composerCopy } from './composer-copy';
import styles from './composer.module.css';

type Option = {
    value: string;
    label: string;
    short?: string;
    description?: string;
};
export function ComposerPreferences({
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
    const copy = conversationCopy(locale);
    const text = composerCopy(locale);
    const languages = useQuery({
        queryKey: ['dictionary-languages'],
        queryFn: ({ signal }) => dictionaryApi.listLanguages(signal),
        staleTime: Infinity,
    });
    const languageOptions: Option[] = [
        {
            value: 'auto',
            label: copy.automatic,
            short: text.auto,
            description: text.autoReply,
        },
        ...(languages.data?.languages ?? []).map((language) => ({
            value: language.tag,
            label: languageLabel(
                languages.data!.languages,
                language.tag,
                locale,
            ),
        })),
    ];
    if (!languageOptions.some((option) => option.value === value.replyLanguage))
        languageOptions.push({
            value: value.replyLanguage,
            label: value.replyLanguage,
        });
    const tones: Option[] = [
        {
            value: 'neutral',
            label: copy.neutral,
            description: text.neutralHint,
        },
        {
            value: 'conversational',
            label: copy.conversational,
            short: text.casual,
            description: text.casualHint,
        },
        {
            value: 'academic',
            label: copy.academic,
            description: text.academicHint,
        },
    ];
    const levels: Option[] = [
        {
            value: 'auto',
            label: copy.automatic,
            short: text.auto,
            description: text.autoLevel,
        },
        {
            value: 'beginner',
            label: copy.beginner,
            short: text.beginner,
            description: text.beginnerHint,
        },
        {
            value: 'detailed',
            label: copy.detailed,
            short: text.detailed,
            description: text.detailedHint,
        },
    ];
    function language(replyLanguage: string) {
        onChange({ ...value, replyLanguage });
    }
    function tone(toneValue: string) {
        onChange({ ...value, tone: toneValue as ChatPreferences['tone'] });
    }
    function level(explanationLevel: string) {
        onChange({
            ...value,
            explanationLevel:
                explanationLevel as ChatPreferences['explanationLevel'],
        });
    }
    return (
        <div className={styles.preferences}>
            <Preference
                label={text.reply}
                fullLabel={copy.language}
                value={value.replyLanguage}
                options={languageOptions}
                onChange={language}
                onDefaults={onDefaults}
                disabled={disabled}
            />
            <Preference
                label={copy.tone}
                fullLabel={copy.tone}
                value={value.tone}
                options={tones}
                onChange={tone}
                onDefaults={onDefaults}
                disabled={disabled}
            />
            <Preference
                label={text.level}
                fullLabel={copy.level}
                value={value.explanationLevel}
                options={levels}
                onChange={level}
                onDefaults={onDefaults}
                disabled={disabled}
            />
        </div>
    );
}
function Preference({
    label,
    fullLabel,
    value,
    options,
    onChange,
    onDefaults,
    disabled,
}: {
    label: string;
    fullLabel: string;
    value: string;
    options: Option[];
    onChange(value: string): void;
    onDefaults(): void;
    disabled: boolean;
}) {
    const { locale } = useI18n();
    const copy = conversationCopy(locale);
    const text = composerCopy(locale);
    const option = options.find((item) => item.value === value);
    const current = option?.short ?? option?.label ?? value;
    const accessible = `${fullLabel}: ${option?.label ?? value}`;
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type='button'
                    className={styles.chip}
                    aria-label={accessible}
                    disabled={disabled}
                >
                    <span>{label}</span>
                    <strong>{current}</strong>
                    <ChevronDown size={12} aria-hidden='true' />
                </button>
            </PopoverTrigger>
            <PopoverContent
                side='top'
                align='start'
                className={styles.preferencePopover}
            >
                <PopoverHeader>{fullLabel}</PopoverHeader>
                {options.map((item) => (
                    <PreferenceOption
                        key={item.value}
                        option={item}
                        selected={item.value === value}
                        onChange={onChange}
                    />
                ))}
                <PopoverSeparator />
                <div className={styles.defaults}>
                    <span>{text.conversationOnly}</span>
                    <button
                        type='button'
                        onClick={onDefaults}
                        disabled={disabled}
                    >
                        {copy.defaults}
                    </button>
                </div>
            </PopoverContent>
        </Popover>
    );
}
function PreferenceOption({
    option,
    selected,
    onChange,
}: {
    option: Option;
    selected: boolean;
    onChange(value: string): void;
}) {
    function choose() {
        onChange(option.value);
    }
    return (
        <PopoverItem selected={selected} onClick={choose}>
            <span className={styles.optionText}>
                {option.label}
                {option.description && <small>{option.description}</small>}
            </span>
        </PopoverItem>
    );
}
