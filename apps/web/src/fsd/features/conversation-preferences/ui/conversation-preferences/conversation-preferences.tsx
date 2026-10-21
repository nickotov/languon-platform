'use client';
import type { ChatPreferences } from '@languon/contracts';
import { useQuery } from '@tanstack/react-query';
import { dictionaryApi, languageLabel } from '@/fsd/entities/dictionary';
import { conversationCopy } from '@/fsd/entities/conversation';
import { useI18n } from '@/fsd/shared/i18n';
import type { PortraitField } from '../../lib/portrait-preferences';
import { portraitSettingsCopy } from '../../lib/portrait-settings-copy';
import styles from './conversation-preferences.module.css';
import { PreferenceField } from './preference-field';

export function ConversationPreferences({
    value,
    onChange,
    disabled = false,
    origins,
    showPortraitSources = false,
    resettableFields = [],
}: {
    value: ChatPreferences;
    onChange(value: ChatPreferences): void;
    disabled?: boolean;
    origins?:
        | Partial<Record<PortraitField, 'manual' | 'portrait' | undefined>>
        | undefined;
    resettableFields?: readonly PortraitField[];
    showPortraitSources?: boolean;
}) {
    const { locale } = useI18n();
    const copy = conversationCopy(locale);
    const portraitCopy = portraitSettingsCopy(locale);
    const languages = useQuery({
        queryKey: ['dictionary-languages'],
        queryFn: ({ signal }) => dictionaryApi.listLanguages(signal),
        staleTime: Infinity,
    });
    const options = [
        { value: 'auto', label: copy.automatic },
        ...(languages.data?.languages ?? []).map((language) => ({
            value: language.tag,
            label: languageLabel(
                languages.data!.languages,
                language.tag,
                locale,
            ),
        })),
    ];
    if (
        value.replyLanguage !== 'auto' &&
        !options.some((option) => option.value === value.replyLanguage)
    )
        options.push({
            value: value.replyLanguage,
            label: value.replyLanguage,
        });
    const toneLabels = {
        en: ['Balanced', 'Friendly', 'Formal'],
        ru: ['Сбалансированный', 'Дружелюбный', 'Формальный'],
        fr: ['Équilibré', 'Amical', 'Formel'],
        es: ['Equilibrado', 'Amable', 'Formal'],
    }[locale];
    const tones = [
        { value: 'neutral', label: toneLabels[0]! },
        { value: 'conversational', label: toneLabels[1]! },
        { value: 'academic', label: toneLabels[2]! },
    ];
    const labels =
        {
            en: [
                'Explanation length',
                'Wording',
                'Examples or theory',
                'Concise',
                'Detailed',
                'Simple',
                'Balanced',
                'Academic',
                'Examples first',
                'Theory first',
                'Explanation language',
            ],
            ru: [
                'Объём объяснений',
                'Формулировки',
                'Примеры или теория',
                'Кратко',
                'Подробно',
                'Просто',
                'Сбалансированно',
                'Академично',
                'Сначала примеры',
                'Сначала теория',
                'Язык объяснений',
            ],
            fr: [
                'Longueur des explications',
                'Formulation',
                'Exemples ou théorie',
                'Concis',
                'Détaillé',
                'Simple',
                'Équilibré',
                'Académique',
                'Exemples d’abord',
                'Théorie d’abord',
                'Langue des explications',
            ],
            es: [
                'Extensión de las explicaciones',
                'Vocabulario',
                'Ejemplos o teoría',
                'Conciso',
                'Detallado',
                'Simple',
                'Equilibrado',
                'Académico',
                'Primero ejemplos',
                'Primero teoría',
                'Idioma de las explicaciones',
            ],
        }[locale] ?? [];
    const fields = [
        {
            key: 'replyLanguage' as const,
            label: labels[10]!,
            value: value.replyLanguage,
            options,
        },
        {
            key: 'tone' as const,
            label: copy.tone,
            value: value.tone,
            options: tones,
        },
        {
            key: 'detail' as const,
            label: labels[0]!,
            value: value.detail ?? 'auto',
            options: [
                { value: 'auto', label: copy.automatic },
                { value: 'concise', label: labels[3]! },
                { value: 'detailed', label: labels[4]! },
            ],
        },
        {
            key: 'wording' as const,
            label: labels[1]!,
            value: value.wording ?? 'auto',
            options: [
                { value: 'auto', label: copy.automatic },
                { value: 'simple', label: labels[5]! },
                { value: 'balanced', label: labels[6]! },
                { value: 'academic', label: labels[7]! },
            ],
        },
        {
            key: 'approach' as const,
            label: labels[2]!,
            value: value.approach ?? 'auto',
            options: [
                { value: 'auto', label: copy.automatic },
                { value: 'examples-first', label: labels[8]! },
                { value: 'theory-first', label: labels[9]! },
                { value: 'balanced', label: labels[6]! },
            ],
        },
    ];
    return (
        <div
            className={styles.controls}
            data-portrait-settings={showPortraitSources}
        >
            {fields.map((field) => (
                <PreferenceField
                    key={field.key}
                    field={field}
                    value={value}
                    onChange={onChange}
                    disabled={disabled}
                    origin={origins?.[field.key] ?? 'manual'}
                    showSource={showPortraitSources}
                    resettable={resettableFields.includes(field.key)}
                    copy={portraitCopy}
                />
            ))}
        </div>
    );
}
