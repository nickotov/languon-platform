import type { ChangeEvent } from 'react';
import type { OwnedDictionary, LanguageCatalogEntry } from '@languon/contracts';
import { RefreshCw, Sparkles } from 'lucide-react';
import {
    languageDirection,
    languageForRole,
    languageLabel,
} from '@/fsd/entities/dictionary';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, Field } from '@/fsd/shared/ui';
import type {
    DictionaryCardAuthoringField,
    AuthoringFieldContent,
    AuthoringFieldSuggestions,
} from '../../types';
import { AuthoringInput } from './authoring-input';
import { FieldProgress } from './field-progress';
import {
    cardFieldLimit,
    limitCardFieldValue,
} from '../../lib/card-field-limits';
import { isFieldAffectedByGeneration } from '../../lib/affected-generation-fields';
import styles from '../dictionary-card-form/dictionary-card-form.module.css';

export function AuthoringField({
    className,
    field,
    dictionary,
    languages,
    content,
    suggestions,
}: {
    className?: string | undefined;
    field: DictionaryCardAuthoringField;
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
    const actionFieldName =
        field === 'source'
            ? t('dictionary.authoring.sourceActionName')
            : fieldName;
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
    const isGenerating =
        suggestions.active &&
        isFieldAffectedByGeneration(
            field,
            suggestions.generatingScope,
            effective,
            ai?.format,
        );
    const exampleMissing =
        field === 'exampleTranslation' && !values.example?.trim();
    const generationDisabled =
        !ai?.available ||
        !suggestions.canGenerate ||
        !values.source.trim() ||
        suggestions.locked ||
        Boolean(ai?.pending) ||
        (Boolean(ai?.proposal) && ai?.format === 'card-authoring:v1') ||
        exampleMissing;
    const generatedSourceUnchanged =
        field === 'source' &&
        ai?.proposal?.source === values.source.trim() &&
        ai.proposal.sourceResult?.kind === 'unchanged';
    const fieldHint = exampleMissing
        ? t('dictionary.authoring.exampleRequired')
        : undefined;
    const hasValue = Boolean(value.trim());
    const actionKey = hasValue
        ? 'dictionary.authoring.regenerateFieldNamed'
        : 'dictionary.authoring.generateFieldNamed';
    const generateLabel = t(actionKey, {
        field: actionFieldName,
    });
    const actionLabel = hasValue
        ? t('dictionary.authoring.regenerateField')
        : t('dictionary.authoring.generateField');
    const regenerationIcon = hasValue ? (
        <RefreshCw aria-hidden size={14} />
    ) : undefined;
    const sourceSuccess = generatedSourceUnchanged
        ? t('dictionary.authoring.sourceUnchanged')
        : undefined;

    function changeValue(
        event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) {
        const next = limitCardFieldValue(field, event.currentTarget.value);
        setValue(field, required ? next : next || null);
    }

    function generateField() {
        suggestions.generateField(field);
    }

    const input = (
        <AuthoringInput
            direction={direction}
            disabled={suggestions.locked}
            inputLimit={inputLimit}
            language={language}
            multiline={multiline}
            onChange={changeValue}
            required={required}
            value={value}
        />
    );

    let control = input;
    if (isGenerating) {
        control = (
            <FieldProgress
                field={field}
                message={t('dictionary.authoring.generatingField', {
                    field: fieldName,
                })}
            />
        );
    }

    return (
        <div className={className}>
            <Field
                control={!isGenerating}
                error={error}
                hint={fieldHint}
                label={label}
                labelAction={
                    <Button
                        aria-label={generateLabel}
                        disabled={generationDisabled}
                        leadingIcon={<Sparkles aria-hidden size={14} />}
                        trailingIcon={regenerationIcon}
                        onClick={generateField}
                        size='compact'
                        type='button'
                        variant='ghost'
                    >
                        {actionLabel}
                    </Button>
                }
                required={required}
                success={sourceSuccess}
            >
                {control}
            </Field>
            {!isGenerating ? (
                <p className={styles.fieldCount}>{count}</p>
            ) : null}
        </div>
    );
}
