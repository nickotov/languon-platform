import type { DictionarySettingsValues } from '@languon/contracts';
import { useI18n } from '@/fsd/shared/i18n';
import { RadioGroup, Switch } from '@/fsd/shared/ui';
import type { SetSetting } from '../../types';
import styles from '../dictionary-settings-form-common.module.css';

export function SettingsLanguageField({
    field,
    settings,
    setSetting,
    sourceLabel,
    targetLabel,
}: {
    field: 'definition' | 'example';
    settings: DictionarySettingsValues;
    setSetting: SetSetting;
    sourceLabel: string;
    targetLabel: string;
}) {
    const { t } = useI18n();

    const enabledKey = `${field}Enabled` as const;

    const languageKey = `${field}Language` as const;

    const enabled = settings[enabledKey];

    const language = settings[languageKey];

    const label = t(`dictionary.field.${field}`);

    const options = [
        { value: 'source', label: sourceLabel },
        { value: 'target', label: targetLabel },
    ];

    function changeEnabled(checked: boolean) {
        setSetting(enabledKey, checked);
    }

    function changeLanguage(value: string) {
        setSetting(languageKey, value as 'source' | 'target');
    }

    return (
        <div className={styles.settingGroup}>
            <Switch
                label={label}
                checked={enabled}
                onCheckedChange={changeEnabled}
            />
            {enabled ? (
                <div className={styles.indented}>
                    <RadioGroup
                        size='sm'
                        orientation='horizontal'
                        label={t('dictionary.settings.writtenIn')}
                        value={language}
                        onChange={changeLanguage}
                        options={options}
                    />
                </div>
            ) : null}
        </div>
    );
}
