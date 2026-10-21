'use client';
import type { PortraitItems } from '@languon/contracts';
import { RadioGroup } from '@/fsd/shared/ui';
import type { Locale } from '@/fsd/shared/i18n';
import {
    TONES,
    LENGTHS,
    WORDINGS,
    ORDERS,
    AGE_RANGES,
} from '../../lib/options';
import { copy, labels } from '../../lib/copy';
import styles from '../common.module.css';
export type PreferenceKey =
    'tone' | 'detail' | 'wording' | 'approach' | 'ageRange';
export function PreferenceField({
    field,
    value,
    onChange,
    locale,
    disabled = false,
}: {
    field: PreferenceKey;
    value: string | undefined;
    onChange: (field: PreferenceKey, value: string) => void;
    locale: Locale;
    disabled?: boolean;
}) {
    const definitions = {
        tone: {
            label: copy(locale, 'Tone', 'Тон', 'Ton', 'Tono'),
            options: TONES,
        },
        detail: {
            label: copy(
                locale,
                'Explanation length',
                'Подробность объяснений',
                'Longueur des explications',
                'Extensión de explicaciones',
            ),
            options: LENGTHS,
        },
        wording: {
            label: copy(
                locale,
                'Wording',
                'Стиль изложения',
                'Vocabulaire',
                'Vocabulario',
            ),
            options: WORDINGS,
        },
        approach: {
            label: copy(
                locale,
                'Examples or theory',
                'Примеры или теория',
                'Exemples ou théorie',
                'Ejemplos o teoría',
            ),
            options: ORDERS,
        },
        ageRange: { label: labels[locale].age, options: AGE_RANGES },
    };
    const definition = definitions[field];
    const options = [
        ...definition.options.map((option) => ({
            value: option.value,
            label: option.label[locale],
        })),
        { value: '', label: labels[locale].preference },
    ];
    const description =
        field === 'ageRange'
            ? copy(
                  locale,
                  'Helps pick relevant examples and life context. It never sets difficulty, maturity, or tone.',
                  'Помогает подобрать примеры и жизненный контекст. Не определяет сложность, зрелость или тон.',
                  'Aide à choisir des exemples et un contexte pertinents. Ne détermine jamais la difficulté, la maturité ou le ton.',
                  'Ayuda a elegir ejemplos y contexto relevantes. Nunca determina la dificultad, la madurez ni el tono.',
              )
            : undefined;
    const descriptionProps = description ? { description } : {};
    function handleChange(next: string) {
        onChange(field, next);
    }
    return (
        <RadioGroup
            label={definition.label}
            {...descriptionProps}
            options={options}
            value={value ?? ''}
            onChange={handleChange}
            disabled={disabled}
            orientation='horizontal'
            size='sm'
        />
    );
}
export function StyleFields({
    items,
    onChange,
    locale,
    disabled = false,
}: {
    items: PortraitItems;
    onChange: (items: PortraitItems) => void;
    locale: Locale;
    disabled?: boolean;
}) {
    function handleChange(field: PreferenceKey, value: string) {
        const next = { ...items };
        if (value) Object.assign(next, { [field]: value });
        else delete next[field];
        onChange(next);
    }
    return (
        <div className={styles.fields}>
            {(['tone', 'detail', 'wording', 'approach'] as const).map(
                (field) => (
                    <PreferenceField
                        key={field}
                        field={field}
                        value={items[field]}
                        onChange={handleChange}
                        locale={locale}
                        disabled={disabled}
                    />
                ),
            )}
        </div>
    );
}
