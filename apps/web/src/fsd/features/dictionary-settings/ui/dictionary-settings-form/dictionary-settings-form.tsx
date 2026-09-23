'use client';

import { useI18n } from '@/fsd/shared/i18n';
import { Button, Field, Input, Textarea } from '@/fsd/shared/ui';
import { useSettingsDraft } from '../../hooks/use-settings-draft';
import type { SettingsFormProps } from '../../types';
import { SettingsLanguagePair } from '../settings-language-pair/settings-language-pair';
import { SettingsCardFields } from '../settings-card-fields/settings-card-fields';
import styles from './dictionary-settings-form.module.css';
export type { SaveDictionarySettings } from '../../types';

export function DictionarySettingsForm(props: SettingsFormProps) {
    const { dictionary, languages, error, pending } = props;
    const { t } = useI18n();
    const state = useSettingsDraft(props);
    const nameCount = `${state.draft.name.length} / 120`;

    return (
        <form className={styles.form} onSubmit={state.submitForm}>
            <div className={styles.content}>
                <section className={styles.section}>
                    <h3>{t('dictionary.settings.basics')}</h3>
                    <Field
                        label={t('dictionary.field.name')}
                        hint={nameCount}
                        required
                    >
                        <Input
                            maxLength={120}
                            onChange={state.changeName}
                            required
                            value={state.draft.name}
                        />
                    </Field>
                    <Field
                        label={t('dictionary.field.description')}
                        optionalLabel={t('dictionary.field.optional')}
                    >
                        <Textarea
                            maxLength={2000}
                            rows={3}
                            showCount
                            onChange={state.changeDescription}
                            value={state.draft.description}
                        />
                    </Field>
                </section>
                <SettingsLanguagePair
                    dictionary={dictionary}
                    languages={languages}
                    state={state}
                />
                <SettingsCardFields
                    dictionary={dictionary}
                    languages={languages}
                    settings={state.draft.settings}
                    setSetting={state.setSetting}
                />
                {error ? <p role='alert'>{error}</p> : null}
                {state.outcome ? (
                    <p aria-live='polite'>{state.outcome}</p>
                ) : null}
            </div>
            <footer className={styles.footer}>
                <p>{t('dictionary.settings.saveHelp')}</p>
                <div className={styles.actions}>
                    <Button
                        disabled={pending}
                        onClick={state.cancel}
                        type='button'
                        variant='secondary'
                    >
                        {t('common.cancel')}
                    </Button>
                    <Button loading={pending} type='submit'>
                        {t('dictionary.settings.save')}
                    </Button>
                </div>
            </footer>
        </form>
    );
}
