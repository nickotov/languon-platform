'use client';

import type { ChangeEvent } from 'react';
import {
    interviewText,
    type InterviewLocale,
} from '../../../../../../lib/interview-copy';
import { InterviewChoice } from '../../../../interview-choice/interview-choice';
import styles from '../../../../../styles/portrait-interview-common.module.css';

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
