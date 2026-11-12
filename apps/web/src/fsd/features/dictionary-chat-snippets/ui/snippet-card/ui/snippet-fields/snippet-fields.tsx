import { useId, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { DictionaryChatSnippet } from '@languon/contracts';
import { useI18n } from '@/fsd/shared/i18n';
import { Checkbox, IconButton } from '@/fsd/shared/ui';
import { snippetCopy } from '../../../../lib/snippet-copy';
import styles from '../../../styles/snippet-card-common.module.css';

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
    const [expanded, setExpanded] = useState(false);
    const detailId = useId();
    const detailLabel = `${copy.details} ${index + 1}: ${card.source}`;
    const hasDetails =
        settings.transcriptionEnabled ||
        settings.definitionEnabled ||
        settings.exampleEnabled ||
        settings.exampleTranslationEnabled;
    const selectionAriaLabel = `${copy.select} ${index + 1}: ${card.source}`;
    const selectionLabel = (
        <span lang={snippet.generationContext.sourceLanguage} dir='auto'>
            {card.source}
        </span>
    );
    const translation = (
        <span
            className={styles.translation}
            lang={snippet.generationContext.targetLanguage}
            dir='auto'
        >
            {card.translation}
        </span>
    );
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

    function toggleDetails() {
        setExpanded((current) => !current);
    }

    return (
        <li className={styles.card} data-dictionary-snippet-index={index}>
            <div className={styles.entrySummary}>
                <Checkbox
                    className={styles.entrySelection}
                    checked={checked}
                    disabled={disabled}
                    onChange={toggle}
                    aria-label={selectionAriaLabel}
                    label={selectionLabel}
                    description={translation}
                />
                {hasDetails && (
                    <IconButton
                        variant='ghost'
                        label={detailLabel}
                        aria-expanded={expanded}
                        aria-controls={detailId}
                        onClick={toggleDetails}
                        showTooltip={false}
                    >
                        <ChevronRight
                            aria-hidden='true'
                            className={styles.chevron}
                            data-expanded={expanded}
                        />
                    </IconButton>
                )}
            </div>
            {hasDetails && (
                <div
                    id={detailId}
                    className={styles.disclosure}
                    data-expanded={expanded}
                    aria-hidden={!expanded}
                    inert={!expanded}
                >
                    <div className={styles.disclosureInner}>
                        <dl className={styles.fields}>
                            {fields.map((field) => (
                                <div key={field.key} className={styles.field}>
                                    <dt className={styles.fieldLabel}>
                                        {field.label}
                                    </dt>
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
                    </div>
                </div>
            )}
        </li>
    );
}
