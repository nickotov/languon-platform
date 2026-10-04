import type { DictionarySettingsValues } from '@languon/contracts';
import type { ChangeEvent } from 'react';
import { useI18n } from '@/fsd/shared/i18n';
import { Field, Input, RadioGroup, Switch } from '@/fsd/shared/ui';
import type { SetSetting } from '../../types';
import styles from '../dictionary-settings-form-common.module.css';

export function SettingsTranscription({
    settings,
    setSetting,
}: {
    settings: DictionarySettingsValues;
    setSetting: SetSetting;
}) {
    const { t } = useI18n();

    const custom = settings.transcriptionNotation === 'custom';

    const customLabel = settings.transcriptionCustomLabel ?? '';

    const options = ['ipa', 'romanization', 'custom'].map((value) => ({
        value,
        label: t(`dictionary.notation.${value}` as 'dictionary.notation.ipa'),
    }));

    function changeEnabled(checked: boolean) {
        setSetting('transcriptionEnabled', checked);
    }

    function changeNotation(value: string) {
        setSetting(
            'transcriptionNotation',
            value as DictionarySettingsValues['transcriptionNotation'],
        );
    }

    function changeCustomLabel(event: ChangeEvent<HTMLInputElement>) {
        setSetting(
            'transcriptionCustomLabel',
            event.currentTarget.value || null,
        );
    }

    return (
        <div className={styles.transcriptionGroup}>
            <Switch
                label={t('dictionary.field.transcription')}
                description={t('dictionary.settings.transcriptionHelp')}
                checked={settings.transcriptionEnabled}
                onCheckedChange={changeEnabled}
            />
            {settings.transcriptionEnabled ? (
                <div className={styles.indented}>
                    <RadioGroup
                        size='sm'
                        label={t('dictionary.settings.notation')}
                        value={settings.transcriptionNotation}
                        onChange={changeNotation}
                        options={options}
                    />
                    {custom ? (
                        <Field
                            label={t('dictionary.settings.customNotation')}
                            required
                        >
                            <Input
                                maxLength={40}
                                required
                                onChange={changeCustomLabel}
                                value={customLabel}
                            />
                        </Field>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
