'use client';

import {
    forwardRef,
    useEffect,
    useId,
    useMemo,
    useState,
    type ChangeEvent,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    KnowledgeCategorySchema,
    KnowledgeNoteContentSchema,
    type KnowledgeWorkingContent,
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
import {
    KnowledgeEditor,
    type KnowledgeEditorHandle,
} from '../knowledge-editor/knowledge-editor';
import styles from './knowledge-note-form.module.css';

export const KnowledgeNoteForm = forwardRef<
    KnowledgeEditorHandle,
    {
        value: KnowledgeWorkingContent;
        onChange(
            update: (
                current: KnowledgeWorkingContent,
            ) => KnowledgeWorkingContent,
        ): void;
        disabled?: boolean;
        error?: string | undefined;
        onValidityChange?: ((valid: boolean) => void) | undefined;
    }
>(function KnowledgeNoteForm(
    { value, onChange, disabled = false, error, onValidityChange },
    ref,
) {
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
    function field<Key extends keyof KnowledgeWorkingContent>(
        key: Key,
        next: KnowledgeWorkingContent[Key],
    ) {
        onChange((current) => ({ ...current, [key]: next }));
    }
    function changeTitle(event: ChangeEvent<HTMLInputElement>) {
        field('title', event.target.value);
    }
    function changeSummary(event: ChangeEvent<HTMLTextAreaElement>) {
        field('summary', event.target.value);
    }
    function changeStudied(event: ChangeEvent<HTMLSelectElement>) {
        field('studiedLanguage', event.target.value || null);
    }
    function changeExplanation(event: ChangeEvent<HTMLSelectElement>) {
        field('explanationLanguage', event.target.value || null);
    }
    function changeBody(body: KnowledgeWorkingContent['body']) {
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
                    options={[{ value: '', label: '—' }, ...options]}
                    value={value.studiedLanguage ?? ''}
                    disabled={disabled}
                    onChange={changeStudied}
                />
                <Select
                    label={t('knowledge.explanationLanguage')}
                    options={[{ value: '', label: '—' }, ...options]}
                    value={value.explanationLanguage ?? ''}
                    disabled={disabled}
                    onChange={changeExplanation}
                />
            </div>
            <div className={styles.explanation}>
                <span id={id} className={styles.label}>
                    {t('knowledge.document')}
                </span>
                <KnowledgeEditor
                    ref={ref}
                    value={value.body}
                    onChange={changeBody}
                    disabled={disabled}
                    label={t('knowledge.document')}
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
});

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
