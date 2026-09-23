import type {
    DictionaryGenerationCandidate,
    DictionaryGenerationField,
    DictionarySingleCardGenerationJob,
    LanguageCatalogEntry,
} from '@languon/contracts';
import type { ChangeEvent } from 'react';

import { languageDirection, languageLabel } from '@/fsd/entities/dictionary';
import { useI18n } from '@/fsd/shared/i18n';
import { Badge, Textarea } from '@/fsd/shared/ui';

import {
    fieldLabel,
    fieldLanguage,
    originalFieldLanguage,
} from '../../lib/review-fields';
import styles from '../dictionary-generation-panel/dictionary-generation-panel.module.css';
import { ReviewAlternative } from './review-alternative';

export function ReviewField({
    candidate,
    field,
    job,
    languages,
    onChange,
}: {
    candidate: DictionaryGenerationCandidate;
    field: DictionaryGenerationField;
    job: DictionarySingleCardGenerationJob;
    languages: readonly LanguageCatalogEntry[];
    onChange(field: DictionaryGenerationField, value: string): void;
}) {
    const { locale, t } = useI18n();
    const snapshot = job.originalSnapshot!;
    const feedback = job.proposal?.fieldFeedback.find(
        (entry) => entry.field === field,
    );
    const value = candidate.values[field] ?? '';
    const savedValue =
        snapshot.values[field] || t('dictionary.generation.empty');
    const language = fieldLanguage(field, candidate.overrides, job);
    const direction = languageDirection(languages, language);
    const savedLanguage = originalFieldLanguage(
        field,
        job,
        snapshot.effectiveSettings,
    );
    const savedDirection = languageDirection(languages, savedLanguage);

    const title = fieldLabel(field, t);
    const languageName = languageLabel(languages, language, locale);
    const sectionLabel = `${title} (${languageName})`;
    const proposedLabel = t('dictionary.generation.replacement');
    const savedLabel = t('dictionary.generation.original');
    const reasonLabel = t('dictionary.generation.reason');
    const sourceWarning = t('dictionary.generation.sourceMayChange');
    const alternatives = feedback?.alternatives ?? [];
    const alternativesLabel = t('dictionary.generation.alternativesCount', {
        count: alternatives.length,
    });
    const required = field === 'source' || field === 'translation';
    const isSource = field === 'source';
    const maxLength = required ? 400 : 4000;

    function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
        onChange(field, event.currentTarget.value);
    }

    function handleAlternative(value: string) {
        onChange(field, value);
    }

    return (
        <section aria-label={sectionLabel} className={styles.proposalField}>
            <header className={styles.fieldHeader}>
                <h3>
                    {title} <span>({languageName})</span>
                </h3>
                {isSource ? (
                    <Badge size='sm' tone='warning'>
                        {sourceWarning}
                    </Badge>
                ) : null}
            </header>
            {feedback?.reason ? (
                <p className={styles.reason}>
                    {reasonLabel} {feedback.reason}
                </p>
            ) : null}
            <div className={styles.fieldComparison}>
                <div className={styles.savedValue}>
                    <p className={styles.savedLabel}>{savedLabel}</p>
                    <p dir={savedDirection} lang={savedLanguage}>
                        {savedValue}
                    </p>
                </div>
                <Textarea
                    aria-required={required}
                    dir={direction}
                    lang={language}
                    label={proposedLabel}
                    maxLength={maxLength}
                    onChange={handleChange}
                    rows={2}
                    value={value}
                />
            </div>
            {alternatives.length ? (
                <div className={styles.alternatives}>
                    <p>{alternativesLabel}</p>
                    <ul>
                        {alternatives.map((alternative) => (
                            <ReviewAlternative
                                key={alternative}
                                language={language}
                                direction={direction}
                                onSelect={handleAlternative}
                                value={alternative}
                            />
                        ))}
                    </ul>
                </div>
            ) : null}
        </section>
    );
}
