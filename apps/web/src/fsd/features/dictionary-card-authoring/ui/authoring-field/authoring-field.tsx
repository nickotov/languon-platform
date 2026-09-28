import type { ChangeEvent } from 'react';
import type { OwnedDictionary, LanguageCatalogEntry } from '@languon/contracts';
import { Sparkles } from 'lucide-react';
import {
    languageDirection,
    languageForRole,
    languageLabel,
} from '@/fsd/entities/dictionary';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, Field } from '@/fsd/shared/ui';
import type {
    DictionaryCardAuthoringField,
    DictionaryCardAuthoringSuggestion,
    AuthoringFieldContent,
    AuthoringFieldSuggestions,
} from '../../types';
import { FieldSuggestions } from '../field-suggestions/field-suggestions';
import { PreviousSuggestions } from './previous-suggestions';
import { AuthoringInput } from './authoring-input';
import { FieldProgress } from './field-progress';
import {
    cardFieldLimit,
    limitCardFieldValue,
} from '../../lib/card-field-limits';
import { isFieldAffectedByGeneration } from '../../lib/affected-generation-fields';
import styles from '../dictionary-card-form/dictionary-card-form.module.css';

export function AuthoringField({
    field,
    dictionary,
    languages,
    content,
    suggestions,
}: {
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
    const sourceSuggestionId =
        ai?.proposal?.sourceResult?.kind === 'suggested'
            ? ai.proposal.sourceResult.suggestionId
            : null;
    const sourceSuggestion =
        ai?.proposal?.sourceSuggestions?.find(
            (suggestion) => suggestion.id === sourceSuggestionId,
        ) ?? null;
    const proposalSuggestions: DictionaryCardAuthoringSuggestion[] = [
        ...(ai?.proposal?.sourceSuggestions ?? []),
        ...(ai?.proposal?.suggestions ?? []),
    ];
    const fieldSuggestions = proposalSuggestions.filter(
        (suggestion) => suggestion.field === field,
    );
    const latestSuggestion =
        field === 'source' && sourceSuggestion
            ? sourceSuggestion
            : (fieldSuggestions.at(-1) ?? null);
    const latestIsHidden = latestSuggestion
        ? suggestions.hiddenSuggestionIds.has(latestSuggestion.id)
        : false;
    const currentSuggestion =
        latestSuggestion &&
        !latestIsHidden &&
        !suggestions.reviewedSuggestionIds.has(latestSuggestion.id)
            ? latestSuggestion
            : null;
    const previousSuggestions = fieldSuggestions
        .filter((suggestion) => suggestion.id !== currentSuggestion?.id)
        .filter(
            (suggestion) =>
                !suggestions.hiddenSuggestionIds.has(suggestion.id) &&
                suggestions.selectedSuggestions[field] !== suggestion.id,
        );
    const isGenerating =
        suggestions.active &&
        isFieldAffectedByGeneration(
            field,
            suggestions.generatingScope,
            effective,
            ai?.format,
        );
    const dependencyBlocked =
        currentSuggestion !== null &&
        field !== 'source' &&
        'basisSource' in currentSuggestion &&
        currentSuggestion.basisSource !== values.source.trim();
    const exampleMissing =
        field === 'exampleTranslation' && !values.example?.trim();
    const generationDisabled =
        !ai?.available ||
        !values.source.trim() ||
        suggestions.active ||
        Boolean(ai?.pending) ||
        (Boolean(ai?.proposal) && ai?.format === 'card-authoring:v1') ||
        exampleMissing;
    const generatedSourceUnchanged =
        field === 'source' &&
        (ai?.proposal?.source === values.source.trim() ||
            ai?.proposal?.sourceSuggestions?.some(
                (suggestion) =>
                    suggestions.selectedSuggestions.source === suggestion.id &&
                    suggestion.value === values.source.trim(),
            )) &&
        ai.proposal.sourceResult?.kind === 'unchanged';
    const fieldHint = exampleMissing
        ? t('dictionary.authoring.exampleRequired')
        : undefined;
    const generateLabel = t('dictionary.authoring.generateFieldNamed', {
        field: actionFieldName,
    });

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
    } else if (currentSuggestion) {
        control = (
            <FieldSuggestions
                current={currentSuggestion}
                direction={direction}
                disabled={dependencyBlocked || suggestions.stale}
                field={field}
                fieldLabel={actionFieldName}
                lang={language}
                onAccept={suggestions.acceptSuggestion}
                onDiscard={suggestions.discardSuggestion}
                onGenerate={suggestions.generateField}
                previous={previousSuggestions}
            />
        );
    }

    return (
        <div>
            <Field
                control={!isGenerating && !currentSuggestion}
                error={error}
                hint={fieldHint}
                label={label}
                labelAction={
                    <Button
                        aria-label={generateLabel}
                        disabled={generationDisabled}
                        leadingIcon={<Sparkles aria-hidden size={14} />}
                        onClick={generateField}
                        size='compact'
                        type='button'
                        variant='ghost'
                    >
                        {t('dictionary.authoring.generateField')}
                    </Button>
                }
                required={required}
                success={
                    generatedSourceUnchanged
                        ? t('dictionary.authoring.sourceUnchanged')
                        : undefined
                }
            >
                {control}
            </Field>
            {!currentSuggestion ? (
                <PreviousSuggestions
                    direction={direction}
                    field={field}
                    fieldLabel={actionFieldName}
                    lang={language}
                    suggestions={suggestions}
                    values={previousSuggestions}
                />
            ) : null}
            {!isGenerating && !currentSuggestion ? (
                <p className={styles.fieldCount}>{count}</p>
            ) : null}
        </div>
    );
}
