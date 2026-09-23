import type { ChangeEvent } from 'react';
import type {
    DictionaryCardValues,
    OwnedDictionary,
    LanguageCatalogEntry,
} from '@languon/contracts';
import {
    languageDirection,
    languageForRole,
    languageLabel,
} from '@/fsd/entities/dictionary';
import { useI18n } from '@/fsd/shared/i18n';
import { Field, Input, Textarea } from '@/fsd/shared/ui';
import type {
    AuthoringFieldContent,
    AuthoringFieldSuggestions,
} from '../../types';
import { FieldSuggestions } from '../field-suggestions/field-suggestions';
import {
    cardFieldLimit,
    limitCardFieldValue,
} from '../../lib/card-field-limits';
import styles from '../dictionary-card-form/dictionary-card-form.module.css';

export function AuthoringField({
    field,
    dictionary,
    languages,
    content,
    suggestions,
}: {
    field: keyof DictionaryCardValues;
    dictionary: OwnedDictionary;
    languages: readonly LanguageCatalogEntry[];
    content: AuthoringFieldContent;
    suggestions: AuthoringFieldSuggestions;
}) {
    const { locale, t } = useI18n();
    const { effective, values, setValue } = content;
    const { ai } = suggestions;
    const role =
        field === 'translation'
            ? 'target'
            : field === 'definition'
              ? effective.definitionLanguage
              : field === 'example'
                ? effective.exampleLanguage
                : field === 'exampleTranslation'
                  ? effective.exampleTranslationLanguage
                  : 'source';

    const language = languageForRole(
        role,
        dictionary.sourceLanguage,
        dictionary.targetLanguage,
    );

    const direction = languageDirection(languages, language);
    const languageName = languageLabel(languages, language, locale);
    const notation =
        effective.transcriptionNotation === 'custom'
            ? effective.transcriptionCustomLabel ||
              t('dictionary.notation.custom')
            : t(`dictionary.notation.${effective.transcriptionNotation}`);

    const fieldName =
        field === 'source'
            ? t('dictionary.authoring.sourceLabel')
            : t(`dictionary.field.${field}`);

    const label =
        field === 'transcription'
            ? `${t('dictionary.field.transcription')} (${notation})`
            : `${fieldName} (${languageName})`;

    const value = values[field] ?? '';
    const maxLength = cardFieldLimit(field);
    const inputLimit = maxLength * 2;
    const length = Array.from(value).length;
    const error =
        length > maxLength
            ? t('dictionary.card.tooLong', { count: maxLength })
            : '';

    const multiline =
        field === 'definition' ||
        field === 'example' ||
        field === 'exampleTranslation';
    const required = field === 'source' || field === 'translation';
    const count = `${length} / ${maxLength}`;

    const regenerationDisabled = suggestions.stale || suggestions.active;
    const selectedId =
        field === 'source' ? undefined : suggestions.selectedSuggestions[field];

    function changeValue(
        event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) {
        const next = limitCardFieldValue(field, event.currentTarget.value);
        setValue(field, required ? next : next || null);
    }

    return (
        <div>
            <Field error={error} label={label} required={required}>
                {multiline ? (
                    <Textarea
                        rows={2}
                        dir={direction}
                        lang={language}
                        maxLength={inputLimit}
                        onChange={changeValue}
                        value={value}
                    />
                ) : (
                    <Input
                        dir={direction}
                        lang={language}
                        maxLength={inputLimit}
                        required={required}
                        onChange={changeValue}
                        value={value}
                    />
                )}
            </Field>
            <p className={styles.fieldCount}>{count}</p>
            {field !== 'source' ? (
                <FieldSuggestions
                    ai={ai}
                    direction={direction}
                    disabled={suggestions.stale}
                    field={field}
                    hidden={suggestions.hiddenSuggestionIds}
                    lang={language}
                    onAccept={suggestions.acceptSuggestion}
                    onDiscard={suggestions.discardSuggestion}
                    onRegenerate={suggestions.regenerateField}
                    regenerationDisabled={regenerationDisabled}
                    selectedId={selectedId}
                />
            ) : null}
        </div>
    );
}
