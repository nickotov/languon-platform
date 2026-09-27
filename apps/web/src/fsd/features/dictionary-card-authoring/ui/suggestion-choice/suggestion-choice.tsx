import type {
    DictionaryCardAuthoringField,
    DictionaryCardAuthoringSuggestion,
} from '../../types';
import { useI18n } from '@/fsd/shared/i18n';
import { Check, Clock, X } from 'lucide-react';
import { Badge, Button } from '@/fsd/shared/ui';
import styles from '../dictionary-card-form/dictionary-card-form.module.css';

export function SuggestionChoice({
    suggestion,
    index,
    selected,
    disabled,
    field,
    fieldLabel,
    direction,
    lang,
    onAccept,
    onDiscard,
}: {
    suggestion: DictionaryCardAuthoringSuggestion;
    index: number;
    selected: boolean;
    disabled: boolean;
    field: DictionaryCardAuthoringField;
    fieldLabel: string;
    direction: 'ltr' | 'rtl';
    lang: string;
    onAccept(
        field: DictionaryCardAuthoringField,
        id: string,
        value: string,
    ): void;
    onDiscard(field: DictionaryCardAuthoringField, id: string): void;
}) {
    const { t } = useI18n();
    const selectedAttribute = selected || undefined;
    const acceptDisabled = disabled || selected;
    const variant = selected ? 'secondary' : 'primary';
    const acceptLabel = t('dictionary.authoring.acceptNamed', {
        field: fieldLabel,
    });
    const discardLabel = t('dictionary.authoring.discardNamed', {
        field: fieldLabel,
    });
    const acceptText = selected
        ? t('dictionary.authoring.accepted')
        : t('dictionary.authoring.accept');
    const choiceLabel = t('dictionary.authoring.choice', { number: index + 1 });

    function accept() {
        onAccept(field, suggestion.id, suggestion.value);
    }
    function discard() {
        onDiscard(field, suggestion.id);
    }

    return (
        <li className={styles.suggestion} data-selected={selectedAttribute}>
            <div className={styles.suggestionContent}>
                <small>{choiceLabel}</small>
                <p dir={direction} lang={lang}>
                    {suggestion.value}
                </p>
                <div className={styles.choiceBadges}>
                    {selected ? (
                        <Badge
                            size='sm'
                            tone='success'
                            icon={<Check aria-hidden size={14} />}
                        >
                            {t('dictionary.authoring.acceptedIntoField')}
                        </Badge>
                    ) : null}
                    {disabled ? (
                        <Badge
                            size='sm'
                            tone='warning'
                            icon={<Clock aria-hidden size={14} />}
                        >
                            {t('dictionary.authoring.staleChoice')}
                        </Badge>
                    ) : null}
                </div>
            </div>
            <div className={styles.suggestionActions}>
                <Button
                    aria-label={acceptLabel}
                    disabled={acceptDisabled}
                    leadingIcon={<Check aria-hidden size={16} />}
                    onClick={accept}
                    size='compact'
                    type='button'
                    variant={variant}
                >
                    {acceptText}
                </Button>
                <Button
                    aria-label={discardLabel}
                    leadingIcon={<X aria-hidden size={16} />}
                    onClick={discard}
                    size='compact'
                    type='button'
                    variant='secondary'
                >
                    {t('dictionary.authoring.discard')}
                </Button>
            </div>
        </li>
    );
}
