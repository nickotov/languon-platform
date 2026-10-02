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
import styles from '../dictionary-card-list/dictionary-card-list.module.css';

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
    const notation =
        card.effectiveSettings.transcriptionNotation === 'custom'
            ? card.effectiveSettings.transcriptionCustomLabel ||
              t('dictionary.notation.custom')
            : t(
                  `dictionary.notation.${card.effectiveSettings.transcriptionNotation}`,
              );
    const transcriptionLabel = `${t('dictionary.field.transcription')} (${notation})`;

    const fields = [
        card.effectiveSettings.transcriptionEnabled && card.values.transcription
            ? {
                  key: 'transcription',
                  label: transcriptionLabel,
                  lang: dictionary.sourceLanguage,
                  value: card.values.transcription,
              }
            : null,
        card.effectiveSettings.definitionEnabled && card.values.definition
            ? {
                  key: 'definition',
                  label: t('dictionary.field.definition'),
                  lang: languageForRole(
                      card.effectiveSettings.definitionLanguage,
                      dictionary.sourceLanguage,
                      dictionary.targetLanguage,
                  ),
                  value: card.values.definition,
              }
            : null,
        card.effectiveSettings.exampleEnabled && card.values.example
            ? {
                  key: 'example',
                  label: t('dictionary.field.example'),
                  lang: languageForRole(
                      card.effectiveSettings.exampleLanguage,
                      dictionary.sourceLanguage,
                      dictionary.targetLanguage,
                  ),
                  value: card.values.example,
              }
            : null,
        card.effectiveSettings.exampleTranslationEnabled &&
        card.values.exampleTranslation
            ? {
                  key: 'exampleTranslation',
                  label: t('dictionary.field.exampleTranslation'),
                  lang: languageForRole(
                      card.effectiveSettings.exampleTranslationLanguage,
                      dictionary.sourceLanguage,
                      dictionary.targetLanguage,
                  ),
                  value: card.values.exampleTranslation,
              }
            : null,
    ].filter((value): value is NonNullable<typeof value> => value !== null);
    const rows = fields.map((field) => {
        const language = languageLabel(languages, field.lang, locale);
        const label =
            field.key === 'transcription'
                ? field.label
                : `${field.label} · ${language}`;
        const direction = languageDirection(languages, field.lang);
        const audio =
            field.key === 'example' || field.key === 'exampleTranslation'
                ? renderAudio?.(card, field.key)
                : null;
        const className =
            field.key === 'transcription' ? styles.transcription : undefined;
        return { ...field, label, direction, audio, className };
    });

    if (!fields.length) return null;
    return (
        <dl className={styles.fields}>
            {rows.map((field) => (
                <div data-field={field.key} key={field.key}>
                    <dt>{field.label}</dt>
                    <dd>
                        <span
                            className={field.className}
                            dir={field.direction}
                            lang={field.lang}
                        >
                            {field.value}
                        </span>
                        {field.audio}
                    </dd>
                </div>
            ))}
        </dl>
    );
}
