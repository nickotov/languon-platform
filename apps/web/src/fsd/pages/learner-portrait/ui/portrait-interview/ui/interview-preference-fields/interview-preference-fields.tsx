'use client';

import type { ChangeEvent } from 'react';
import { type InterviewLocale } from '../../../../lib/interview-copy';
import { InterviewChoice } from '../../interview-choice/interview-choice';
import styles from '../../../styles/portrait-interview-common.module.css';

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
