import { type ChangeEvent, useId, useState } from 'react';
import { Lock } from 'lucide-react';
import {
    dictionaryErrorMessage,
    languageLabel,
} from '@/fsd/entities/dictionary';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Button,
    Dialog,
    Field,
    Input,
    Select,
    Textarea,
} from '@/fsd/shared/ui';
import type { LibraryState } from '../../hooks/use-dictionary-library';
import styles from './library-create-dialog.module.css';

export type LibraryCreateDialogProps = Pick<
    LibraryState,
    | 'catalog'
    | 'createOpen'
    | 'createSourceLanguage'
    | 'createTargetLanguage'
    | 'changeSource'
    | 'changeTarget'
    | 'closeCreate'
    | 'submitCreate'
> & {
    create: Pick<LibraryState['create'], 'isPending' | 'error'>;
};

export function LibraryCreateDialog({
    state,
}: {
    state: LibraryCreateDialogProps;
}) {
    const { locale, t } = useI18n();
    const formId = useId();
    const [name, setName] = useState('');
    const nameCount = `${name.length} / 120`;

    function changeName(event: ChangeEvent<HTMLInputElement>) {
        setName(event.currentTarget.value);
    }

    const options = state.catalog.map((language) => ({
        value: language.tag,
        label: languageLabel(state.catalog, language.tag, locale),
    }));
    const dismissible = !state.create.isPending;
    const error = state.create.error
        ? dictionaryErrorMessage(state.create.error, t)
        : null;
    const hasError = error !== null;
    const labels = {
        cancel: t('common.cancel'),
        catalogHint: t('dictionary.create.catalogHint'),
        close: t('dictionary.dialog.close'),
        description: t('dictionary.create.description'),
        descriptionField: t('dictionary.field.description'),
        name: t('dictionary.field.name'),
        namePlaceholder: t('dictionary.create.namePlaceholder'),
        optional: t('dictionary.field.optional'),
        privateNotice: t('dictionary.create.privateNotice'),
        sourceLanguage: t('dictionary.field.sourceLanguage'),
        submit: t('dictionary.create.submit'),
        targetLanguage: t('dictionary.field.targetLanguage'),
        title: t('dictionary.create.title'),
    };

    const footer = (
        <div className={styles.createFooter}>
            <p className={styles.privateNotice}>
                <Lock aria-hidden size={14} />
                {labels.privateNotice}
            </p>
            <div className={styles.actions}>
                <Button
                    disabled={state.create.isPending}
                    onClick={state.closeCreate}
                    type='button'
                    variant='secondary'
                >
                    {labels.cancel}
                </Button>
                <Button
                    loading={state.create.isPending}
                    type='submit'
                    form={formId}
                >
                    {labels.submit}
                </Button>
            </div>
        </div>
    );

    return (
        <Dialog
            footer={footer}
            closeLabel={labels.close}
            description={labels.description}
            dismissible={dismissible}
            onClose={state.closeCreate}
            open={state.createOpen}
            title={labels.title}
        >
            <form
                id={formId}
                className={styles.form}
                onSubmit={state.submitCreate}
            >
                <Field label={labels.name} hint={nameCount} required>
                    <Input
                        disabled={state.create.isPending}
                        maxLength={120}
                        name='name'
                        onChange={changeName}
                        value={name}
                        placeholder={labels.namePlaceholder}
                        required
                    />
                </Field>
                <div className={styles.languageFields}>
                    <Field label={labels.sourceLanguage} required>
                        <Select
                            disabled={state.create.isPending}
                            name='sourceLanguage'
                            onChange={state.changeSource}
                            required
                            value={state.createSourceLanguage}
                            options={options}
                        />
                    </Field>
                    <Field
                        label={labels.targetLanguage}
                        hint={labels.catalogHint}
                        required
                    >
                        <Select
                            disabled={state.create.isPending}
                            name='targetLanguage'
                            onChange={state.changeTarget}
                            required
                            value={state.createTargetLanguage}
                            options={options}
                        />
                    </Field>
                </div>
                <Field
                    label={labels.descriptionField}
                    optionalLabel={labels.optional}
                >
                    <Textarea
                        className={styles.textarea}
                        disabled={state.create.isPending}
                        maxLength={2000}
                        name='description'
                        rows={3}
                        showCount
                    />
                </Field>
                {hasError && <p role='alert'>{error}</p>}
            </form>
        </Dialog>
    );
}
