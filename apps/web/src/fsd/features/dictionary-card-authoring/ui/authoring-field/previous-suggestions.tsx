import type {
    DictionaryCardAuthoringField,
    DictionaryCardAuthoringSuggestion,
    AuthoringFieldSuggestions,
} from '../../types';
import { useI18n } from '@/fsd/shared/i18n';
import { SuggestionChoice } from '../suggestion-choice/suggestion-choice';
import styles from '../dictionary-card-form/dictionary-card-form.module.css';

export function PreviousSuggestions({
    direction,
    field,
    fieldLabel,
    lang,
    suggestions,
    values,
}: {
    direction: 'ltr' | 'rtl';
    field: DictionaryCardAuthoringField;
    fieldLabel: string;
    lang: string;
    suggestions: AuthoringFieldSuggestions;
    values: DictionaryCardAuthoringSuggestion[];
}) {
    const { t } = useI18n();
    if (values.length === 0) return null;

    return (
        <details className={styles.previousSuggestions}>
            <summary>
                {t('dictionary.authoring.previousOptions', {
                    count: values.length,
                })}
            </summary>
            <ul className={styles.suggestionList}>
                {values.map((suggestion, index) => (
                    <SuggestionChoice
                        key={suggestion.id}
                        suggestion={suggestion}
                        index={index}
                        selected={false}
                        disabled={suggestions.stale}
                        field={field}
                        fieldLabel={fieldLabel}
                        direction={direction}
                        lang={lang}
                        onAccept={suggestions.acceptSuggestion}
                        onDiscard={suggestions.discardSuggestion}
                    />
                ))}
            </ul>
        </details>
    );
}
