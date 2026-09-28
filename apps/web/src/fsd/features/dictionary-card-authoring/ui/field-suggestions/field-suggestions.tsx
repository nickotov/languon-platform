import { Check, RefreshCw, Sparkles, X } from 'lucide-react';
import type {
    DictionaryCardAuthoringField,
    DictionaryCardAuthoringSuggestion,
} from '../../types';
import { useI18n } from '@/fsd/shared/i18n';
import { Button } from '@/fsd/shared/ui';
import { SuggestionChoice } from '../suggestion-choice/suggestion-choice';
import styles from '../dictionary-card-form/dictionary-card-form.module.css';

export function FieldSuggestions({
    'aria-describedby': ariaDescribedBy,
    'aria-labelledby': ariaLabelledBy,
    current,
    direction,
    disabled,
    generationDisabled,
    field,
    fieldLabel,
    lang,
    onAccept,
    onDiscard,
    onGenerate,
    previous,
}: {
    'aria-describedby'?: string;
    'aria-labelledby'?: string;
    current: DictionaryCardAuthoringSuggestion;
    direction: 'ltr' | 'rtl';
    disabled: boolean;
    generationDisabled: boolean;
    field: DictionaryCardAuthoringField;
    fieldLabel: string;
    lang: string;
    onAccept(
        field: DictionaryCardAuthoringField,
        id: string,
        value: string,
    ): void;
    onDiscard(field: DictionaryCardAuthoringField, id: string): void;
    onGenerate(field: DictionaryCardAuthoringField): void;
    previous: DictionaryCardAuthoringSuggestion[];
}) {
    const { t } = useI18n();
    const acceptLabel = t('dictionary.authoring.acceptNamed', {
        field: fieldLabel,
    });
    const rejectLabel = t('dictionary.authoring.rejectNamed', {
        field: fieldLabel,
    });
    const tryAnotherLabel = t('dictionary.authoring.tryAnotherNamed', {
        field: fieldLabel,
    });

    function accept() {
        onAccept(field, current.id, current.value);
    }

    function reject() {
        onDiscard(field, current.id);
    }

    function generateAnother() {
        onGenerate(field);
    }

    return (
        <div
            aria-describedby={ariaDescribedBy}
            aria-labelledby={ariaLabelledBy}
            className={styles.inlineSuggestion}
            data-testid={`ai-review-${field}`}
            role='group'
        >
            <div className={styles.inlineSuggestionHeading}>
                <span>
                    <Sparkles aria-hidden size={14} />
                    {t('dictionary.authoring.aiSuggestion')}
                </span>
                <small>{t('dictionary.authoring.notSaved')}</small>
            </div>
            <p dir={direction} lang={lang}>
                {current.value}
            </p>
            {disabled ? (
                <small className={styles.suggestionDependency}>
                    {t('dictionary.authoring.acceptSourceFirst')}
                </small>
            ) : null}
            <div className={styles.suggestionActions}>
                <Button
                    aria-label={acceptLabel}
                    disabled={disabled}
                    leadingIcon={<Check aria-hidden size={16} />}
                    onClick={accept}
                    size='compact'
                    type='button'
                >
                    {t('dictionary.authoring.accept')}
                </Button>
                <Button
                    aria-label={rejectLabel}
                    leadingIcon={<X aria-hidden size={16} />}
                    onClick={reject}
                    size='compact'
                    type='button'
                    variant='secondary'
                >
                    {t('dictionary.authoring.reject')}
                </Button>
                <Button
                    aria-label={tryAnotherLabel}
                    disabled={disabled || generationDisabled}
                    leadingIcon={<RefreshCw aria-hidden size={16} />}
                    onClick={generateAnother}
                    size='compact'
                    type='button'
                    variant='ghost'
                >
                    {t('dictionary.authoring.tryAnother')}
                </Button>
            </div>
            {previous.length > 0 ? (
                <details className={styles.previousSuggestions}>
                    <summary>
                        {t('dictionary.authoring.previousOptions', {
                            count: previous.length,
                        })}
                    </summary>
                    <ul className={styles.suggestionList}>
                        {previous.map((suggestion, index) => (
                            <SuggestionChoice
                                key={suggestion.id}
                                suggestion={suggestion}
                                index={index}
                                selected={false}
                                disabled={disabled}
                                field={field}
                                fieldLabel={fieldLabel}
                                direction={direction}
                                lang={lang}
                                onAccept={onAccept}
                                onDiscard={onDiscard}
                            />
                        ))}
                    </ul>
                </details>
            ) : null}
        </div>
    );
}
