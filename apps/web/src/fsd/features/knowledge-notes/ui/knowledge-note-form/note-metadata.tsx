'use client';

import { useMemo, type ChangeEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    KnowledgeCategorySchema,
    type KnowledgeWorkingContent,
    type KnowledgeCategory,
} from '@languon/contracts';
import { dictionaryApi } from '@/fsd/entities/dictionary';
import { knowledgeCategoryKeys } from '@/fsd/entities/knowledge';
import { useI18n } from '@/fsd/shared/i18n';
import { Select, Textarea, type SelectOption } from '@/fsd/shared/ui';
import { NoteCategory } from './note-category';
import { WorkspaceProperties } from './workspace-properties';
import styles from './knowledge-note-form.module.css';

export function NoteMetadata({
    value,
    onChange,
    workspace,
    disabled,
}: {
    value: KnowledgeWorkingContent;
    onChange(
        update: (current: KnowledgeWorkingContent) => KnowledgeWorkingContent,
    ): void;
    workspace: boolean;
    disabled: boolean;
}) {
    const { t, locale } = useI18n();
    const languages = useQuery({
        queryKey: ['dictionary-languages'],
        queryFn: ({ signal }) => dictionaryApi.listLanguages(signal),
        staleTime: Infinity,
    });
    const options = useMemo(() => {
        const choices: SelectOption[] =
            languages.data?.languages.map((language) => ({
                value: language.tag,
                label: language.displayNames[locale],
            })) ?? [];
        for (const language of [
            value.studiedLanguage,
            value.explanationLanguage,
        ]) {
            if (language && !choices.some((item) => item.value === language))
                choices.push({ value: language, label: language });
        }
        return [{ value: '', label: '—' }, ...choices];
    }, [
        languages.data,
        locale,
        value.studiedLanguage,
        value.explanationLanguage,
    ]);
    function changeSummary(event: ChangeEvent<HTMLTextAreaElement>) {
        const summary = event.target.value;
        onChange((current) => ({ ...current, summary }));
    }
    function changeStudied(event: ChangeEvent<HTMLSelectElement>) {
        const studiedLanguage = event.target.value || null;
        onChange((current) => ({ ...current, studiedLanguage }));
    }
    function changeExplanation(event: ChangeEvent<HTMLSelectElement>) {
        const explanationLanguage = event.target.value || null;
        onChange((current) => ({ ...current, explanationLanguage }));
    }
    function changeCategories(categories: KnowledgeCategory[]) {
        onChange((current) => ({ ...current, categories }));
    }
    const summaryField = (
        <Textarea
            label={t('knowledge.summary')}
            value={value.summary}
            maxLength={1_000}
            rows={3}
            disabled={disabled}
            onChange={changeSummary}
        />
    );
    const categoryFields = (
        <fieldset className={styles.categories} disabled={disabled}>
            <legend>{t('knowledge.categories')}</legend>
            <div className={styles.categoryOptions}>
                {KnowledgeCategorySchema.options.map((category) => (
                    <NoteCategory
                        key={category}
                        category={category}
                        compact={workspace}
                        categories={value.categories}
                        onChange={changeCategories}
                    />
                ))}
            </div>
        </fieldset>
    );
    const languageFields = (
        <div
            className={workspace ? styles.propertyLanguages : styles.languages}
        >
            <Select
                label={t('knowledge.studiedLanguage')}
                options={options}
                value={value.studiedLanguage ?? ''}
                disabled={disabled}
                onChange={changeStudied}
            />
            <Select
                label={t('knowledge.explanationLanguage')}
                options={options}
                value={value.explanationLanguage ?? ''}
                disabled={disabled}
                onChange={changeExplanation}
            />
        </div>
    );
    const categorySummary = value.categories
        .map((category) => t(knowledgeCategoryKeys[category]))
        .join(', ');
    const languageSummary = [value.studiedLanguage, value.explanationLanguage]
        .filter(Boolean)
        .map((tag) => options.find((option) => option.value === tag)?.label)
        .join(' → ');
    if (workspace)
        return (
            <WorkspaceProperties
                languages={languageSummary}
                categories={categorySummary}
                summary={value.summary}
                summaryField={summaryField}
                categoryFields={categoryFields}
                languageFields={languageFields}
            />
        );
    return (
        <div className={styles.legacyFields}>
            {summaryField}
            {categoryFields}
            {languageFields}
        </div>
    );
}
