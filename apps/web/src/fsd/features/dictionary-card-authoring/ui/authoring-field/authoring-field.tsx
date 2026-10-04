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
import styles from '../dictionary-card-form-common.module.css';

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

    function resolveRole() {
        if (field === 'translation') {
            return 'target' as const;
        }

        if (field === 'definition') {
            return effective.definitionLanguage;
        }

        if (field === 'example') {
            return effective.exampleLanguage;
        }

        if (field === 'exampleTranslation') {
            return effective.exampleTranslationLanguage;
        }

        return 'source' as const;
    }

    const role = resolveRole();

    const language = languageForRole(
        role,
        dictionary.sourceLanguage,
        dictionary.targetLanguage,
    );

    const direction = languageDirection(languages, language);

    const languageName = languageLabel(languages, language, locale);

    function resolveNotation() {
        if (effective.transcriptionNotation === 'custom') {
            return (
                effective.transcriptionCustomLabel ||
                t('dictionary.notation.custom')
            );
        }

        return t(`dictionary.notation.${effective.transcriptionNotation}`);
    }

    const notation = resolveNotation();

    function resolveFieldName() {
        if (field === 'source') {
            return t('dictionary.authoring.sourceLabel');
        }

        return t(`dictionary.field.${field}`);
    }

    const fieldName = resolveFieldName();

    const actionFieldName =
        field === 'source'
            ? t('dictionary.authoring.sourceActionName')
            : fieldName;

    function resolveLabel() {
        if (field === 'transcription') {
            return `${t('dictionary.field.transcription')} (${notation})`;
        }

        return `${fieldName} (${languageName})`;
    }

    const label = resolveLabel();

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

    function resolveActionKey() {
        if (hasValue) {
            return 'dictionary.authoring.regenerateFieldNamed' as const;
        }

        return 'dictionary.authoring.generateFieldNamed' as const;
    }

    const actionKey = resolveActionKey();

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
