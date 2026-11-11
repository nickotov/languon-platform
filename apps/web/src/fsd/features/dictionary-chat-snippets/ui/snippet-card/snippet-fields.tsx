import type { DictionaryChatSnippet } from '@languon/contracts';
import { useI18n } from '@/fsd/shared/i18n';
import { Checkbox } from '@/fsd/shared/ui';
import { snippetCopy } from '../../lib/snippet-copy';
import styles from './snippet-card.module.css';

export function SnippetFields({
    snippet,
    index,
    checked,
    disabled,
    onToggle,
}: {
    snippet: DictionaryChatSnippet;
    index: number;
    checked: boolean;
    disabled: boolean;
    onToggle(index: number): void;
}) {
    const { t, locale } = useI18n();
    const copy = snippetCopy(locale);
    const card = snippet.cards[index]!;
    const settings = snippet.generationContext.settings;
    const label = `${copy.select} ${index + 1}: ${card.source}`;
    const fields: {
        key: keyof typeof card;
        label: string;
        language?: string;
    }[] = [
        {
            key: 'source',
            label: t('dictionary.field.source'),
            language: snippet.generationContext.sourceLanguage,
        },
        {
            key: 'translation',
            label: t('dictionary.field.translation'),
            language: snippet.generationContext.targetLanguage,
        },
    ];

    if (settings.transcriptionEnabled) {
        fields.push({
            key: 'transcription',
            label:
                settings.transcriptionCustomLabel ??
                t('dictionary.field.transcription'),
        });
    }

    if (settings.definitionEnabled) {
        fields.push({
            key: 'definition',
            label: t('dictionary.field.definition'),
        });
    }

    if (settings.exampleEnabled) {
        fields.push({ key: 'example', label: t('dictionary.field.example') });
    }

    if (settings.exampleTranslationEnabled) {
        fields.push({
            key: 'exampleTranslation',
            label: t('dictionary.field.exampleTranslation'),
        });
    }

    function toggle() {
        onToggle(index);
    }

    return (
        <li className={styles.card} data-dictionary-snippet-index={index}>
            <Checkbox
                checked={checked}
                disabled={disabled}
                onChange={toggle}
                label={label}
            />
            <dl className={styles.fields}>
                {fields.map((field) => (
                    <div key={field.key} className={styles.field}>
                        <dt className={styles.fieldLabel}>{field.label}</dt>
                        <dd
                            className={styles.value}
                            lang={field.language}
                            dir='auto'
                        >
                            {card[field.key]}
                        </dd>
                    </div>
                ))}
            </dl>
        </li>
    );
}
