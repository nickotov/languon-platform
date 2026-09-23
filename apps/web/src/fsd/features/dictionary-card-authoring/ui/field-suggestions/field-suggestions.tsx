import { useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import type { DictionaryCardAuthoringField } from '@languon/contracts';
import { useI18n } from '@/fsd/shared/i18n';
import { Button } from '@/fsd/shared/ui';
import type { DictionaryCardAuthoringAI } from '../../types';
import { SuggestionChoice } from '../suggestion-choice/suggestion-choice';
import styles from '../dictionary-card-form/dictionary-card-form.module.css';

export function FieldSuggestions({
    ai,
    direction,
    disabled,
    field,
    hidden,
    lang,
    onAccept,
    onDiscard,
    onRegenerate,
    regenerationDisabled,
    selectedId,
}: {
    ai?: Pick<DictionaryCardAuthoringAI, 'pending' | 'proposal'> | undefined;
    direction: 'ltr' | 'rtl';
    disabled: boolean;
    field: DictionaryCardAuthoringField;
    hidden: ReadonlySet<string>;
    lang: string;
    onAccept(
        field: DictionaryCardAuthoringField,
        id: string,
        value: string,
    ): void;
    onDiscard(field: DictionaryCardAuthoringField, id: string): void;
    onRegenerate(field: DictionaryCardAuthoringField): void;
    regenerationDisabled: boolean;
    selectedId?: string | undefined;
}) {
    const { t } = useI18n();
    const [expanded, setExpanded] = useState(false);
    const suggestions =
        ai?.proposal?.suggestions.filter(
            (suggestion) =>
                suggestion.field === field && !hidden.has(suggestion.id),
        ) ?? [];
    if (suggestions.length === 0) return null;
    const fieldLabel = t(`dictionary.field.${field}`);
    const atLimit = suggestions.length >= 6;
    const visibleSuggestions = expanded ? suggestions : suggestions.slice(0, 2);
    const sectionLabel = t('dictionary.authoring.suggestionsFor', {
        field: fieldLabel,
    });
    const regenerateLabel = t('dictionary.authoring.regenerateFieldNamed', {
        field: fieldLabel,
    });
    const regenerateDisabled = regenerationDisabled || ai?.pending || atLimit;
    const expandedLabel = expanded
        ? t('dictionary.authoring.showFewer')
        : t('dictionary.authoring.showMore', { count: suggestions.length - 2 });

    function regenerate() {
        onRegenerate(field);
    }
    function toggleExpanded() {
        setExpanded(!expanded);
    }
    function renderSuggestion(
        suggestion: NonNullable<
            DictionaryCardAuthoringAI['proposal']
        >['suggestions'][number],
        index: number,
    ) {
        const selected = selectedId === suggestion.id;
        return (
            <SuggestionChoice
                key={suggestion.id}
                suggestion={suggestion}
                index={index}
                selected={selected}
                disabled={disabled}
                field={field}
                fieldLabel={fieldLabel}
                direction={direction}
                lang={lang}
                onAccept={onAccept}
                onDiscard={onDiscard}
            />
        );
    }

    return (
        <section aria-label={sectionLabel} className={styles.suggestions}>
            <div className={styles.suggestionHeading}>
                <strong>
                    <Sparkles aria-hidden size={14} />
                    {t('dictionary.authoring.notSaved')}{' '}
                    <span className={styles.choiceCount}>
                        {t('dictionary.authoring.choiceCount', {
                            count: suggestions.length,
                        })}
                    </span>
                </strong>
                <Button
                    leadingIcon={<RefreshCw aria-hidden='true' size={14} />}
                    aria-label={regenerateLabel}
                    disabled={regenerateDisabled}
                    onClick={regenerate}
                    size='compact'
                    type='button'
                    variant='secondary'
                >
                    {regenerateLabel}
                </Button>
            </div>
            {atLimit ? (
                <small>{t('dictionary.authoring.limitReached')}</small>
            ) : null}
            <ul className={styles.suggestionList}>
                {visibleSuggestions.map(renderSuggestion)}
            </ul>
            {suggestions.length > 2 ? (
                <Button
                    aria-expanded={expanded}
                    onClick={toggleExpanded}
                    size='compact'
                    type='button'
                    variant='secondary'
                >
                    {expandedLabel}
                </Button>
            ) : null}
        </section>
    );
}
