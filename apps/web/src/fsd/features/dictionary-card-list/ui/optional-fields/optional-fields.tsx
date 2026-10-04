import type {
    DictionaryCard,
    LanguageCatalogEntry,
    OwnedDictionary,
} from '@languon/contracts';
import type { ReactNode } from 'react';
import {
    languageDirection,
    languageForRole,
    languageLabel,
} from '@/fsd/entities/dictionary';
import { useI18n } from '@/fsd/shared/i18n';
import styles from '../dictionary-card-list-common.module.css';

export function OptionalFields({
    card,
    dictionary,
    languages,
    renderAudio,
}: {
    card: DictionaryCard;
    dictionary: OwnedDictionary;
    languages: readonly LanguageCatalogEntry[];
    renderAudio?:
        | ((
              card: DictionaryCard,
              field: 'example' | 'exampleTranslation',
          ) => ReactNode)
        | undefined;
}) {
    const { locale, t } = useI18n();

    const fields: {
        key: 'definition' | 'example' | 'exampleTranslation';
        label: string;
        lang: string;
        value: string;
    }[] = [];

    if (card.effectiveSettings.definitionEnabled && card.values.definition) {
        fields.push({
            key: 'definition',
            label: t('dictionary.field.definition'),
            lang: languageForRole(
                card.effectiveSettings.definitionLanguage,
                dictionary.sourceLanguage,
                dictionary.targetLanguage,
            ),
            value: card.values.definition,
        });
    }

    if (card.effectiveSettings.exampleEnabled && card.values.example) {
        fields.push({
            key: 'example',
            label: t('dictionary.field.example'),
            lang: languageForRole(
                card.effectiveSettings.exampleLanguage,
                dictionary.sourceLanguage,
                dictionary.targetLanguage,
            ),
            value: card.values.example,
        });
    }

    if (
        card.effectiveSettings.exampleTranslationEnabled &&
        card.values.exampleTranslation
    ) {
        fields.push({
            key: 'exampleTranslation',
            label: t('dictionary.field.exampleTranslation'),
            lang: languageForRole(
                card.effectiveSettings.exampleTranslationLanguage,
                dictionary.sourceLanguage,
                dictionary.targetLanguage,
            ),
            value: card.values.exampleTranslation,
        });
    }

    const rows = fields.map((field) => {
        const language = languageLabel(languages, field.lang, locale);

        const label = `${field.label} · ${language}`;

        const direction = languageDirection(languages, field.lang);

        let audio: ReactNode = null;

        const classes = [styles.fieldRow];

        if (field.key === 'example') {
            classes.push(styles.exampleRow);

            audio = renderAudio?.(card, field.key);
        }

        if (field.key === 'exampleTranslation') {
            classes.push(styles.exampleTranslationRow);

            audio = renderAudio?.(card, field.key);
        }

        return {
            ...field,
            label,
            direction,
            audio,
            rowClassName: classes.join(' '),
        };
    });

    const pairedExamples =
        fields.some((field) => field.key === 'example') &&
        fields.some((field) => field.key === 'exampleTranslation');

    const fieldsClassName = [
        styles.fields,
        pairedExamples ? styles.pairedExamples : '',
    ]
        .filter(Boolean)
        .join(' ');

    if (!fields.length) return null;

    return (
        <dl className={fieldsClassName}>
            {rows.map((field) => (
                <div
                    className={field.rowClassName}
                    data-field={field.key}
                    key={field.key}
                >
                    <dt className={styles.fieldLabel}>{field.label}</dt>
                    <dd className={styles.fieldValue}>
                        <span
                            className={styles.fieldText}
                            dir={field.direction}
                            lang={field.lang}
                        >
                            {field.value}
                        </span>
                        {field.audio ? (
                            <span className={styles.fieldAudio}>
                                {field.audio}
                            </span>
                        ) : null}
                    </dd>
                </div>
            ))}
        </dl>
    );
}
