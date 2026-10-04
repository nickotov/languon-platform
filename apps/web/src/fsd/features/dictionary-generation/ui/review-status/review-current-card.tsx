import type {
    DictionaryCard,
    LanguageCatalogEntry,
    OwnedDictionary,
} from '@languon/contracts';

import { languageDirection, languageLabel } from '@/fsd/entities/dictionary';
import { useI18n } from '@/fsd/shared/i18n';
import { Badge } from '@/fsd/shared/ui';

import {
    FIELD_KEYS,
    fieldLabel,
    originalFieldLanguage,
} from '../../lib/review-fields';
import styles from '../dictionary-generation-panel-common.module.css';

export function ReviewCurrentCard({
    card,
    dictionary,
    languages,
}: {
    card: DictionaryCard;
    dictionary: OwnedDictionary;
    languages: readonly LanguageCatalogEntry[];
}) {
    const { locale, t } = useI18n();

    const title = t('dictionary.generation.current');

    const version = t('dictionary.generation.currentVersion', {
        version: card.version,
    });

    const fields = FIELD_KEYS.map((field) => {
        const language = originalFieldLanguage(
            field,
            dictionary,
            card.effectiveSettings,
        );

        return {
            field,
            language,
            direction: languageDirection(languages, language),
            label: `${fieldLabel(field, t)} · ${languageLabel(languages, language, locale)}`,
            value: card.values[field] ?? t('dictionary.generation.empty'),
        };
    });

    return (
        <section className={styles.proposalField}>
            <header className={styles.fieldHeader}>
                <h3 className={styles.fieldTitle}>{title}</h3>
                <Badge tone='warning'>{version}</Badge>
            </header>
            <dl className={styles.currentValues}>
                {fields.map((field) => (
                    <div key={field.field}>
                        <dt className={styles.currentLabel}>{field.label}</dt>
                        <dd
                            className={styles.currentValue}
                            dir={field.direction}
                            lang={field.language}
                        >
                            {field.value}
                        </dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}
