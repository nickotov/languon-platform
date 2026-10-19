'use client';

import { useEffect, useId, useMemo, useState, type ChangeEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    KnowledgeCategorySchema,
    KnowledgeNoteContentSchema,
    type KnowledgeNoteContent,
    type KnowledgeCategory,
} from '@languon/contracts';
import { dictionaryApi } from '@/fsd/entities/dictionary';
import { knowledgeCategoryKeys } from '@/fsd/entities/knowledge';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Checkbox,
    Input,
    Select,
    Textarea,
    type SelectOption,
} from '@/fsd/shared/ui';
import { KnowledgeEditor } from '../knowledge-editor/knowledge-editor';
import styles from './knowledge-note-form.module.css';

export function KnowledgeNoteForm({
    value,
    onChange,
    disabled = false,
    error,
    onValidityChange,
}: {
    value: KnowledgeNoteContent;
    onChange(value: KnowledgeNoteContent): void;
    disabled?: boolean;
    error?: string | undefined;
    onValidityChange?: ((valid: boolean) => void) | undefined;
}) {
    const { t, locale } = useI18n();
    const id = useId();
    const [editorValid, setEditorValid] = useState(true);
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
                choices.push({
                    value: language,
                    label: language,
                });
        }
        return choices;
    }, [
        languages.data,
        locale,
        value.studiedLanguage,
        value.explanationLanguage,
    ]);
    const valid =
        editorValid && KnowledgeNoteContentSchema.safeParse(value).success;
    useEffect(() => {
        onValidityChange?.(valid);
    }, [onValidityChange, valid]);
    function field<Key extends keyof KnowledgeNoteContent>(
        key: Key,
        next: KnowledgeNoteContent[Key],
    ) {
        onChange({ ...value, [key]: next });
    }
    function changeTitle(event: ChangeEvent<HTMLInputElement>) {
        field('title', event.target.value);
    }
    function changeSummary(event: ChangeEvent<HTMLTextAreaElement>) {
        field('summary', event.target.value);
    }
    function changeStudied(event: ChangeEvent<HTMLSelectElement>) {
        field('studiedLanguage', event.target.value);
    }
    function changeExplanation(event: ChangeEvent<HTMLSelectElement>) {
        field('explanationLanguage', event.target.value);
    }
    function changeBody(body: KnowledgeNoteContent['body']) {
        field('body', body);
    }
    function changeCategories(categories: KnowledgeCategory[]) {
        field('categories', categories);
    }
    return (
        <div className={styles.form}>
            <Input
                label={t('knowledge.noteTitle')}
                value={value.title}
                maxLength={200}
                required
                disabled={disabled}
                onChange={changeTitle}
            />
            <Textarea
                label={t('knowledge.summary')}
                value={value.summary}
                maxLength={1_000}
                rows={3}
                required
                disabled={disabled}
                onChange={changeSummary}
            />
            <fieldset className={styles.categories} disabled={disabled}>
                <legend>{t('knowledge.categories')}</legend>
                <div className={styles.categoryOptions}>
                    {KnowledgeCategorySchema.options.map((category) => (
                        <NoteCategory
                            key={category}
                            category={category}
                            categories={value.categories}
                            onChange={changeCategories}
                        />
                    ))}
                </div>
            </fieldset>
            <div className={styles.languages}>
                <Select
                    label={t('knowledge.studiedLanguage')}
                    options={options}
                    value={value.studiedLanguage}
                    disabled={disabled}
                    onChange={changeStudied}
                />
                <Select
                    label={t('knowledge.explanationLanguage')}
                    options={options}
                    value={value.explanationLanguage}
                    disabled={disabled}
                    onChange={changeExplanation}
                />
            </div>
            <div className={styles.explanation}>
                <span id={id} className={styles.label}>
                    {t('knowledge.explanation')}
                </span>
                <KnowledgeEditor
                    value={value.body}
                    onChange={changeBody}
                    disabled={disabled}
                    onValidityChange={setEditorValid}
                />
            </div>
            {error && (
                <p className={styles.error} role='alert'>
                    {error}
                </p>
            )}
        </div>
    );
}

function NoteCategory({
    category,
    categories,
    onChange,
}: {
    category: KnowledgeCategory;
    categories: KnowledgeCategory[];
    onChange(next: KnowledgeCategory[]): void;
}) {
    const { t } = useI18n();
    function change(event: ChangeEvent<HTMLInputElement>) {
        const next = event.target.checked
            ? [...categories, category]
            : categories.filter((item) => item !== category);
        onChange(next);
    }
    return (
        <Checkbox
            label={t(knowledgeCategoryKeys[category])}
            checked={categories.includes(category)}
            onChange={change}
        />
    );
}
