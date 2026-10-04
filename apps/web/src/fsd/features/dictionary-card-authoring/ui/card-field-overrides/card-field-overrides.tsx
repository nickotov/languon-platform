import { languageLabel } from '@/fsd/entities/dictionary';
import { useI18n } from '@/fsd/shared/i18n';
import { Badge, Radio, RadioGroup, Switch } from '@/fsd/shared/ui';
import type {
    DictionaryCardOverrides,
    OwnedDictionary,
    LanguageCatalogEntry,
} from '@languon/contracts';
import type { AuthoringFieldContent } from '../../types';
import styles from '../dictionary-card-form/dictionary-card-form.module.css';

export function CardFieldOverrides({
    dictionary,
    disabled = false,
    languages,
    effective,
    overrides,
    setOverride,
    replaceOverrides,
}: {
    dictionary: OwnedDictionary;
    disabled?: boolean;
    languages: readonly LanguageCatalogEntry[];
    effective: AuthoringFieldContent['effective'];
    overrides: DictionaryCardOverrides;
    setOverride<K extends keyof DictionaryCardOverrides>(
        key: K,
        value: DictionaryCardOverrides[K],
    ): void;
    replaceOverrides(overrides: DictionaryCardOverrides): void;
}) {
    const { locale, t } = useI18n();
    const overriding = Object.values(overrides).some((value) => value !== null);
    const tone = overriding ? 'warning' : 'neutral';
    const status = overriding
        ? t('dictionary.override.overridden')
        : t('dictionary.override.inherited');
    const sourceName = languageLabel(
        languages,
        dictionary.sourceLanguage,
        locale,
    );
    const targetName = languageLabel(
        languages,
        dictionary.targetLanguage,
        locale,
    );

    function toggleOverride(checked: boolean) {
        const settings = dictionary.settings.values;
        replaceOverrides({
            transcriptionEnabled: checked
                ? settings.transcriptionEnabled
                    ? 'enabled'
                    : 'disabled'
                : null,
            definitionEnabled: checked
                ? settings.definitionEnabled
                    ? 'enabled'
                    : 'disabled'
                : null,
            exampleEnabled: checked
                ? settings.exampleEnabled
                    ? 'enabled'
                    : 'disabled'
                : null,
            exampleTranslationEnabled: checked
                ? settings.exampleTranslationEnabled
                    ? 'enabled'
                    : 'disabled'
                : null,
            definitionLanguage: checked ? settings.definitionLanguage : null,
            exampleLanguage: checked ? settings.exampleLanguage : null,
            transcriptionNotation: null,
            transcriptionCustomLabel: null,
        });
    }
    function toggleTranscription(checked: boolean) {
        setOverride('transcriptionEnabled', checked ? 'enabled' : 'disabled');
    }
    function toggleDefinition(checked: boolean) {
        setOverride('definitionEnabled', checked ? 'enabled' : 'disabled');
    }
    function toggleExample(checked: boolean) {
        setOverride('exampleEnabled', checked ? 'enabled' : 'disabled');
    }
    function toggleExampleTranslation(checked: boolean) {
        setOverride(
            'exampleTranslationEnabled',
            checked ? 'enabled' : 'disabled',
        );
    }
    function changeDefinitionLanguage(value: string) {
        if (value === 'source' || value === 'target')
            setOverride('definitionLanguage', value);
    }
    function changeExampleLanguage(value: string) {
        if (value === 'source' || value === 'target')
            setOverride('exampleLanguage', value);
    }

    return (
        <div className={styles.overrideDivider}>
            <section className={styles.overridePanel}>
                <div className={styles.overrideHeading}>
                    <div>
                        <p className={styles.overrideTitle}>
                            {t('dictionary.override.title')}
                        </p>
                        <small className={styles.overrideDescription}>
                            {t('dictionary.override.description')}
                        </small>
                    </div>
                    <Badge tone={tone}>{status}</Badge>
                </div>
                <Switch
                    disabled={disabled}
                    size='sm'
                    label={t('dictionary.override.toggle')}
                    aria-label={t('dictionary.override.toggle')}
                    description={t('dictionary.override.help')}
                    checked={overriding}
                    onCheckedChange={toggleOverride}
                />
                {overriding ? (
                    <div className={styles.overrideFields}>
                        <Switch
                            disabled={disabled}
                            size='sm'
                            label={t('dictionary.field.transcription')}
                            checked={effective.transcriptionEnabled}
                            onCheckedChange={toggleTranscription}
                        />
                        <Switch
                            disabled={disabled}
                            size='sm'
                            label={t('dictionary.field.definition')}
                            checked={effective.definitionEnabled}
                            onCheckedChange={toggleDefinition}
                        />
                        {effective.definitionEnabled ? (
                            <RadioGroup
                                disabled={disabled}
                                size='sm'
                                orientation='horizontal'
                                label={t(
                                    'dictionary.settings.definitionLanguage',
                                )}
                                value={effective.definitionLanguage}
                                onChange={changeDefinitionLanguage}
                            >
                                <Radio value='source'>{sourceName}</Radio>
                                <Radio value='target'>{targetName}</Radio>
                            </RadioGroup>
                        ) : null}
                        <Switch
                            disabled={disabled}
                            size='sm'
                            label={t('dictionary.field.example')}
                            checked={effective.exampleEnabled}
                            onCheckedChange={toggleExample}
                        />
                        {effective.exampleEnabled ? (
                            <>
                                <RadioGroup
                                    disabled={disabled}
                                    size='sm'
                                    orientation='horizontal'
                                    label={t(
                                        'dictionary.settings.exampleLanguage',
                                    )}
                                    value={effective.exampleLanguage}
                                    onChange={changeExampleLanguage}
                                >
                                    <Radio value='source'>{sourceName}</Radio>
                                    <Radio value='target'>{targetName}</Radio>
                                </RadioGroup>
                                <Switch
                                    disabled={disabled}
                                    size='sm'
                                    label={t(
                                        'dictionary.field.exampleTranslation',
                                    )}
                                    checked={
                                        effective.exampleTranslationEnabled
                                    }
                                    onCheckedChange={toggleExampleTranslation}
                                />
                            </>
                        ) : null}
                    </div>
                ) : null}
            </section>
        </div>
    );
}
