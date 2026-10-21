'use client';
import type { ChangeEvent } from 'react';
import { interviewText, type InterviewLocale } from '../../lib/interview-copy';
import { InterviewChoice } from './interview-choice';
import styles from './portrait-interview.module.css';
const dimensions = [
    {
        key: 'tone',
        labels: ['Tone', 'Тон', 'Ton', 'Tono'],
        values: [
            ['Friendly', 'Дружелюбный', 'Amical', 'Amable'],
            ['Balanced', 'Сбалансированный', 'Équilibré', 'Equilibrado'],
            ['Formal', 'Формальный', 'Formel', 'Formal'],
        ],
    },
    {
        key: 'detail',
        labels: ['Explanation length', 'Подробность', 'Longueur', 'Extensión'],
        values: [
            ['Concise', 'Кратко', 'Concis', 'Conciso'],
            ['Detailed', 'Подробно', 'Détaillé', 'Detallado'],
        ],
    },
    {
        key: 'wording',
        labels: ['Wording', 'Сложность языка', 'Vocabulaire', 'Vocabulario'],
        values: [
            ['Simple', 'Простой', 'Simple', 'Sencillo'],
            ['Balanced', 'Сбалансированный', 'Équilibré', 'Equilibrado'],
            ['Academic', 'Академический', 'Académique', 'Académico'],
        ],
    },
    {
        key: 'approach',
        labels: [
            'Examples or theory',
            'Примеры или теория',
            'Exemples ou théorie',
            'Ejemplos o teoría',
        ],
        values: [
            [
                'Examples first',
                'Сначала примеры',
                'Exemples d’abord',
                'Ejemplos primero',
            ],
            [
                'Theory first',
                'Сначала теория',
                'Théorie d’abord',
                'Teoría primero',
            ],
            ['Balanced', 'Сбалансированно', 'Équilibré', 'Equilibrado'],
        ],
    },
];
export function InterviewPreferenceFields({
    locale,
    values,
    onChange,
}: {
    locale: InterviewLocale;
    values: Record<string, string>;
    onChange(values: Record<string, string>): void;
}) {
    const index = ['en', 'ru', 'fr', 'es'].indexOf(locale);
    function select(event: ChangeEvent<HTMLInputElement>) {
        onChange({ ...values, [event.target.name]: event.target.value });
    }
    return (
        <div className={styles.preferenceFields}>
            {dimensions.map((dimension) => (
                <fieldset key={dimension.key} className={styles.fieldset}>
                    <legend>{dimension.labels[index]}</legend>
                    <div className={styles.fieldChoices}>
                        {dimension.values.map((labels) => (
                            <InterviewChoice
                                key={labels[0]}
                                label={labels[index]!}
                                name={dimension.key}
                                value={`${dimension.key}: ${labels[0]}`}
                                checked={
                                    values[dimension.key] ===
                                    `${dimension.key}: ${labels[0]}`
                                }
                                onChange={select}
                            />
                        ))}
                    </div>
                </fieldset>
            ))}
        </div>
    );
}
export function InterviewMixingField({
    locale,
    value,
    onChange,
}: {
    locale: InterviewLocale;
    value: string;
    onChange(value: string): void;
}) {
    const index = ['en', 'ru', 'fr', 'es'].indexOf(locale);
    function select(event: ChangeEvent<HTMLInputElement>) {
        onChange(event.target.value);
    }
    const choices = [
        {
            value: 'mixed-language: sometimes',
            labels: ['Sometimes', 'Иногда', 'Parfois', 'A veces'],
        },
        {
            value: 'mixed-language: helpful',
            labels: ['Yes', 'Да', 'Oui', 'Sí'],
        },
        { value: 'mixed-language: avoid', labels: ['No', 'Нет', 'Non', 'No'] },
        {
            value: '',
            labels: [
                interviewText(locale, 'unknown'),
                interviewText(locale, 'unknown'),
                interviewText(locale, 'unknown'),
                interviewText(locale, 'unknown'),
            ],
        },
    ];
    return (
        <fieldset className={styles.fieldset}>
            <legend>
                {
                    [
                        'Are mixed-language explanations helpful?',
                        'Полезны ли объяснения на нескольких языках?',
                        'Les explications multilingues sont-elles utiles ?',
                        '¿Ayudan las explicaciones en varios idiomas?',
                    ][index]
                }
            </legend>
            <div className={styles.fieldChoices}>
                {choices.map((choice) => (
                    <InterviewChoice
                        key={choice.value}
                        label={choice.labels[index]!}
                        name='mixed-language'
                        value={choice.value}
                        checked={value === choice.value}
                        onChange={select}
                    />
                ))}
            </div>
        </fieldset>
    );
}
