import type {
    DictionarySettingsValues,
    LanguageCatalogEntry,
    OwnedDictionary,
} from '@languon/contracts';
import { languageLabel } from '@/fsd/entities/dictionary';
import { useI18n } from '@/fsd/shared/i18n';
import { Switch } from '@/fsd/shared/ui';
import type { SetSetting } from '../../types';
import { SettingsTranscription } from '../settings-transcription/settings-transcription';
import { SettingsLanguageField } from '../settings-language-field/settings-language-field';
import styles from '../dictionary-settings-form/dictionary-settings-form.module.css';

export function SettingsCardFields({
    dictionary,
    languages,
    settings,
    setSetting,
}: {
    dictionary: OwnedDictionary;
    languages: readonly LanguageCatalogEntry[];
    settings: DictionarySettingsValues;
    setSetting: SetSetting;
}) {
    const { locale, t } = useI18n();
    const sourceLabel = languageLabel(
        languages,
        dictionary.sourceLanguage,
        locale,
    );
    const targetLabel = languageLabel(
        languages,
        dictionary.targetLanguage,
        locale,
    );
    const translationLanguage =
        settings.exampleLanguage === 'source' ? targetLabel : sourceLabel;
    const translationChecked =
        settings.exampleEnabled && settings.exampleTranslationEnabled;
    const translationDisabled = !settings.exampleEnabled;
    const translationHelp = settings.exampleEnabled
        ? t('dictionary.settings.exampleTranslationHelp', {
              language: translationLanguage,
          })
        : t('dictionary.settings.exampleTranslationDisabled');

    function changeTranslation(checked: boolean) {
        setSetting('exampleTranslationEnabled', checked);
    }

    return (
        <section className={styles.section}>
            <div>
                <h3>{t('dictionary.settings.cardFields')}</h3>
                <p className={styles.hint}>
                    {t('dictionary.settings.inactiveHelp')}
                </p>
            </div>
            <SettingsTranscription
                settings={settings}
                setSetting={setSetting}
            />
            <SettingsLanguageField
                field='definition'
                settings={settings}
                setSetting={setSetting}
                sourceLabel={sourceLabel}
                targetLabel={targetLabel}
            />
            <SettingsLanguageField
                field='example'
                settings={settings}
                setSetting={setSetting}
                sourceLabel={sourceLabel}
                targetLabel={targetLabel}
            />
            <div className={styles.settingGroup}>
                <Switch
                    label={t('dictionary.field.exampleTranslation')}
                    description={translationHelp}
                    checked={translationChecked}
                    disabled={translationDisabled}
                    onCheckedChange={changeTranslation}
                />
            </div>
        </section>
    );
}
