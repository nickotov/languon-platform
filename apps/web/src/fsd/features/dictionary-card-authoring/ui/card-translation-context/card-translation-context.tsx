'use client';

import type { ChangeEvent } from 'react';

import { useI18n } from '@/fsd/shared/i18n';
import { Field, Switch, Textarea } from '@/fsd/shared/ui';

import styles from './card-translation-context.module.css';

export function CardTranslationContext({
    cardContext,
    dictionaryContext,
    disabled,
    onChange,
    textareaClassName,
}: {
    cardContext: string | null;
    dictionaryContext: string | null;
    disabled: boolean;
    onChange(value: string | null): void;
    textareaClassName?: string | undefined;
}) {
    const { t } = useI18n();

    const enabled = cardContext !== null;

    const hasExistingContext = Boolean(dictionaryContext || cardContext);

    const switchLabel = hasExistingContext
        ? t('dictionary.context.update')
        : t('dictionary.context.set');

    const contextLength = cardContext === null ? 0 : [...cardContext].length;

    let validationError: string | undefined;

    if (enabled && !cardContext.trim()) {
        validationError = t('dictionary.context.cardRequired');
    } else if (contextLength > 1000) {
        validationError = t('dictionary.context.tooLong', { count: 1000 });
    }

    function handleEnabledChange(checked: boolean) {
        onChange(checked ? '' : null);
    }

    function handleContextChange(event: ChangeEvent<HTMLTextAreaElement>) {
        onChange(event.currentTarget.value);
    }

    return (
        <section className={styles.section}>
            <Switch
                checked={enabled}
                description={t('dictionary.context.cardSwitchHelp')}
                disabled={disabled}
                label={switchLabel}
                onCheckedChange={handleEnabledChange}
            />
            {dictionaryContext && !cardContext ? (
                <div className={styles.inherited}>
                    <span className={styles.inheritedLabel}>
                        {t('dictionary.context.inherited')}
                    </span>
                    <p className={styles.inheritedValue}>{dictionaryContext}</p>
                </div>
            ) : null}
            {enabled ? (
                <Field
                    error={validationError}
                    hint={t('dictionary.context.cardHelp')}
                    label={t('dictionary.context.cardLabel')}
                    required
                >
                    <Textarea
                        className={textareaClassName}
                        disabled={disabled}
                        maxLength={2000}
                        onChange={handleContextChange}
                        required
                        rows={3}
                        value={cardContext}
                    />
                </Field>
            ) : null}
        </section>
    );
}
