'use client';

import { KnowledgeDocumentView } from '@/fsd/features/knowledge-notes';

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
import { Input, Select, Textarea, type SelectOption } from '@/fsd/shared/ui';
import { KnowledgeEditor } from '@/fsd/features/knowledge-notes';
import { Eye, Pencil } from 'lucide-react';
import { messagesCopy } from '../../lib/messages-copy';
import styles from './tutor-note-form.module.css';

export function TutorNoteForm({
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
    const labels = messagesCopy(locale);
    const [preview, setPreview] = useState(false);
    function togglePreview() {
        setPreview((value) => !value);
    }
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
                className={styles.titleInput}
                value={value.title}
                maxLength={200}
                aria-required
                disabled={disabled}
                onChange={changeTitle}
            />
            <Textarea
                label={labels.summary}
                className={styles.summaryInput}
                value={value.summary}
                maxLength={1_000}
                rows={2}
                aria-required
                disabled={disabled}
                onChange={changeSummary}
            />
            <div className={styles.explanation}>
                <div className={styles.explanationHeader}>
                    <span id={id} className={styles.label}>
                        {labels.explanation}
                    </span>
                    <button
                        type='button'
                        className={styles.previewButton}
                        aria-pressed={preview}
                        onClick={togglePreview}
                    >
                        {preview ? (
                            <Pencil size={14} aria-hidden='true' />
                        ) : (
                            <Eye size={14} aria-hidden='true' />
                        )}
                        {preview ? labels.edit : labels.preview}
                    </button>
                </div>
                {preview && <KnowledgeDocumentView body={value.body} />}
                <div hidden={preview} className={styles.richEditor}>
                    <KnowledgeEditor
                        toolbarVariant='tutor'
                        value={value.body}
                        onChange={changeBody}
                        disabled={disabled}
                        onValidityChange={setEditorValid}
                    />
                </div>
            </div>
            <div className={styles.languages}>
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
    const selected = categories.includes(category);
    function change() {
        onChange(
            selected
                ? categories.filter((item) => item !== category)
                : [...categories, category],
        );
    }
    return (
        <button
            type='button'
            className={styles.category}
            aria-pressed={selected}
            onClick={change}
        >
            {t(knowledgeCategoryKeys[category])}
        </button>
    );
}
