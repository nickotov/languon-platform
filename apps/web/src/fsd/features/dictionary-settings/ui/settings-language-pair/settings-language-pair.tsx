import type { LanguageCatalogEntry, OwnedDictionary } from '@languon/contracts';
import { Lock } from 'lucide-react';
import { languageLabel } from '@/fsd/entities/dictionary';
import { useI18n } from '@/fsd/shared/i18n';
import { Badge, Field, Select } from '@/fsd/shared/ui';
import type { useSettingsDraft } from '../../hooks/use-settings-draft';
import styles from '../dictionary-settings-form/dictionary-settings-form.module.css';

export function SettingsLanguagePair({
    dictionary,
    languages,
    state,
}: {
    dictionary: OwnedDictionary;
    languages: readonly LanguageCatalogEntry[];
    state: ReturnType<typeof useSettingsDraft>;
}) {
    const { locale, t } = useI18n();
    const options = languages.map((language) => ({
        value: language.tag,
        label: languageLabel(languages, language.tag, locale),
    }));
    const source = languageLabel(languages, dictionary.sourceLanguage, locale);
    const target = languageLabel(languages, dictionary.targetLanguage, locale);
    const pair = `${source} → ${target}`;

    return (
        <section className={styles.section}>
            <div className={styles.sectionHeading}>
                <h3 className={styles.sectionTitle}>
                    {t('dictionary.settings.languagePair')}
                </h3>
                {state.pairLocked ? (
                    <Badge size='sm' icon={<Lock aria-hidden size={14} />}>
                        {t('dictionary.settings.locked')}
                    </Badge>
                ) : null}
            </div>
            {state.pairLocked ? (
                <>
                    <p className={styles.sectionDescription}>{pair}</p>
                    <p
                        className={[
                            styles.hint,
                            styles.sectionDescription,
                        ].join(' ')}
                    >
                        {t('dictionary.settings.pairLocked')}
                    </p>
                </>
            ) : (
                <>
                    <div className={styles.twoColumns}>
                        <Field
                            label={t('dictionary.field.sourceLanguage')}
                            required
                        >
                            <Select
                                onChange={state.changeSource}
                                value={state.draft.sourceLanguage}
                                options={options}
                            />
                        </Field>
                        <Field
                            label={t('dictionary.field.targetLanguage')}
                            required
                        >
                            <Select
                                onChange={state.changeTarget}
                                value={state.draft.targetLanguage}
                                options={options}
                            />
                        </Field>
                    </div>
                    <p
                        className={[
                            styles.hint,
                            styles.sectionDescription,
                        ].join(' ')}
                    >
                        {t('dictionary.settings.pairEditable')}
                    </p>
                </>
            )}
        </section>
    );
}
