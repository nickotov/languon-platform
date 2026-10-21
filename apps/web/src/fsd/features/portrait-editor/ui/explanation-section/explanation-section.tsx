'use client';
import type { PortraitItems } from '@languon/contracts';
import type { Locale } from '@/fsd/shared/i18n';
import { RadioGroup } from '@/fsd/shared/ui';
import { labels, copy } from '../../lib/copy';
import { MIXING } from '../../lib/options';
import { ShortTextInput } from '../short-text-input/short-text-input';
import { languageLabel, toggleItem } from '../../lib/items';
import { ChoiceChip, EditorSection } from '../editor-controls/editor-controls';
import styles from '../common.module.css';
export function ExplanationSection({
    items,
    onChange,
    locale,
    description,
    disabled = false,
}: {
    items: PortraitItems;
    onChange: (items: PortraitItems) => void;
    locale: Locale;
    description: string;
    disabled?: boolean;
}) {
    const text = labels[locale];
    const explanationChoices = Array.from(
        new Set([
            ...items.languages.map((item) => item.language),
            'en',
            'es',
            'fr',
            'ru',
            ...items.explanationLanguages,
        ]),
    );
    const mixedOptions = [
        ...MIXING.map((option) => ({
            value: option.value,
            label: option.label[locale],
        })),
        { value: '', label: text.preference },
    ];
    let mixedValue = items.mixedLanguageFrequency ?? '';
    if (!mixedValue && items.mixedLanguage !== undefined)
        mixedValue = items.mixedLanguage ? 'helpful' : 'avoid';
    const question = copy(
        locale,
        'Are mixed-language explanations helpful?',
        'Полезны ли объяснения на нескольких языках?',
        'Les explications multilingues vous aident-elles ?',
        '¿Te ayudan las explicaciones multilingües?',
    );
    const legend = copy(
        locale,
        'Comfortable for explanations',
        'Удобны для объяснений',
        'À l’aise pour les explications',
        'Cómodos para explicaciones',
    );
    const placeholder = copy(
        locale,
        'e.g., Mostly English, with short Spanish examples.',
        'Например, в основном по-английски, с короткими примерами на испанском.',
        'Ex. : surtout en anglais, avec de courts exemples en espagnol.',
        'P. ej., principalmente en inglés, con ejemplos breves en español.',
    );
    const noteLabel = copy(
        locale,
        'In your words (optional)',
        'Своими словами (необязательно)',
        'Avec vos mots (facultatif)',
        'Con tus palabras (opcional)',
    );
    function handleExplanation(value: string) {
        const next = toggleItem(items.explanationLanguages, value);
        onChange({ ...items, explanationLanguages: next });
    }
    function handleMixed(value: string) {
        const next = { ...items };
        if (!value) {
            delete next.mixedLanguage;
            delete next.mixedLanguageFrequency;
        } else {
            next.mixedLanguageFrequency = value as NonNullable<
                PortraitItems['mixedLanguageFrequency']
            >;
            next.mixedLanguage = value !== 'avoid';
        }
        onChange(next);
    }
    function handleNote(value: string) {
        const next = { ...items };
        if (value) next.mixingNote = value;
        else delete next.mixingNote;
        onChange(next);
    }
    return (
        <EditorSection
            title={text.explanation}
            description={description}
            count={
                items.explanationLanguages.length +
                Number(
                    items.mixedLanguageFrequency !== undefined ||
                        items.mixedLanguage !== undefined,
                ) +
                Number(Boolean(items.mixingNote))
            }
            locale={locale}
        >
            <div role='group' aria-label={legend}>
                <p className={styles.legend}>{legend}</p>
                <div className={styles.chips}>
                    {explanationChoices.map((code) => {
                        const selected =
                            items.explanationLanguages.includes(code);
                        const chipDisabled =
                            disabled ||
                            (!selected &&
                                items.explanationLanguages.length >= 10);
                        return (
                            <ChoiceChip
                                key={code}
                                value={code}
                                label={languageLabel(code, locale)}
                                selected={selected}
                                onToggle={handleExplanation}
                                disabled={chipDisabled}
                            />
                        );
                    })}
                </div>
            </div>
            <RadioGroup
                label={question}
                options={mixedOptions}
                value={mixedValue}
                onChange={handleMixed}
                orientation='horizontal'
                size='sm'
                disabled={disabled}
            />
            <ShortTextInput
                label={noteLabel}
                placeholder={placeholder}
                value={items.mixingNote ?? ''}
                onChange={handleNote}
                locale={locale}
                disabled={disabled}
            />
        </EditorSection>
    );
}
