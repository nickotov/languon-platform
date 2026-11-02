import type { ChangeEvent } from 'react';
import type {
    DictionaryGenerationField,
    LanguageCatalogEntry,
    OwnedDictionary,
    DictionaryDocumentTermsGenerationJob,
} from '@languon/contracts';
import { languageDirection } from '@/fsd/entities/dictionary';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Button,
    Card,
    Checkbox,
    Field,
    InlineAlert,
    Input,
    Textarea,
} from '@/fsd/shared/ui';
import {
    EDITABLE_FIELDS,
    fieldEnabled,
    fieldLanguage,
    type CandidateDraft,
} from '../../lib/candidate-review';
import styles from './dictionary-document-generation-panel.module.css';

export function CandidateRow({
    dictionary,
    draft,
    job,
    languages,
    onChange,
    onRemove,
    onSelectedChange,
    pending,
    selected,
}: {
    dictionary: OwnedDictionary;
    draft: CandidateDraft;
    job: DictionaryDocumentTermsGenerationJob;
    languages: readonly LanguageCatalogEntry[];
    onChange(
        rowIndex: number,
        field: DictionaryGenerationField,
        value: string,
    ): void;
    onRemove(rowIndex: number): void;
    onSelectedChange(rowIndex: number, selected: boolean): void;
    pending: boolean;
    selected: boolean;
}) {
    const { t } = useI18n();

    const proposalRow = job.proposal?.candidates.find(
        (row) => row.rowIndex === draft.rowIndex,
    );

    const warnings = job.proposal?.warnings.filter(
        (warning) => warning.rowIndex === draft.rowIndex,
    );

    function changeSelection(event: ChangeEvent<HTMLInputElement>) {
        onSelectedChange(draft.rowIndex, event.currentTarget.checked);
    }

    function remove() {
        onRemove(draft.rowIndex);
    }

    return (
        <Card className={styles.row}>
            <header className={styles.rowHeader}>
                <Checkbox
                    checked={selected}
                    disabled={pending}
                    onChange={changeSelection}
                >
                    {t('dictionary.document.includeRow', {
                        position: draft.rowIndex + 1,
                    })}
                </Checkbox>
                <Button
                    disabled={pending}
                    onClick={remove}
                    size='small'
                    type='button'
                    variant='quiet'
                >
                    {t('dictionary.document.removeRow')}
                </Button>
            </header>
            <p className={styles.inputTerm}>
                {t('dictionary.document.extractedTerm')}{' '}
                <span
                    className={styles.inputValue}
                    dir={languageDirection(
                        languages,
                        dictionary.sourceLanguage,
                    )}
                    lang={dictionary.sourceLanguage}
                >
                    {draft.input}
                </span>
            </p>
            {warnings?.map((warning) => (
                <InlineAlert key={warning.code} tone='warning'>
                    {warning.message}
                </InlineAlert>
            ))}
            <div className={styles.fields}>
                {EDITABLE_FIELDS.filter((field) =>
                    fieldEnabled(field, dictionary, draft.candidate),
                ).map((field) => {
                    const language = fieldLanguage(
                        field,
                        dictionary,
                        draft.candidate,
                    );

                    const value = draft.candidate.values[field] ?? '';

                    function changeField(
                        event: ChangeEvent<
                            HTMLInputElement | HTMLTextAreaElement
                        >,
                    ) {
                        onChange(
                            draft.rowIndex,
                            field,
                            event.currentTarget.value,
                        );
                    }

                    function resolveControl() {
                        if (
                            [
                                'definition',
                                'example',
                                'exampleTranslation',
                            ].includes(field)
                        ) {
                            return Textarea;
                        }

                        return Input;
                    }

                    const Control = resolveControl();

                    return (
                        <Field
                            key={field}
                            label={t(`dictionary.field.${field}`)}
                            required={
                                field === 'source' || field === 'translation'
                            }
                        >
                            <Control
                                dir={languageDirection(languages, language)}
                                disabled={pending || !selected}
                                lang={language}
                                onChange={changeField}
                                value={value}
                            />
                        </Field>
                    );
                })}
            </div>
            {proposalRow?.fieldFeedback.length ? (
                <details className={styles.feedback}>
                    <summary className={styles.feedbackSummary}>
                        {t('dictionary.document.feedback')}
                    </summary>
                    <ul className={styles.feedbackList}>
                        {proposalRow.fieldFeedback.map((feedback) => (
                            <li key={feedback.field}>
                                <strong>
                                    {t(`dictionary.field.${feedback.field}`)}:
                                </strong>{' '}
                                {feedback.reason}
                            </li>
                        ))}
                    </ul>
                </details>
            ) : null}
        </Card>
    );
}
