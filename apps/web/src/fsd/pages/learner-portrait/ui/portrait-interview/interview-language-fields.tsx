import type { ChangeEvent } from 'react';
import type { PortraitInterviewerOutput } from '@languon/contracts';
import { Checkbox, Select } from '@/fsd/shared/ui';
import {
    interviewText,
    interviewLevelOptions,
    type InterviewLocale,
} from '../../lib/interview-copy';
import styles from './portrait-interview.module.css';
export function InterviewLanguageFields({
    selected,
    options,
    values,
    locale,
    onChange,
}: {
    selected: string[];
    options: PortraitInterviewerOutput['options'];
    values: Record<string, { level: string; learning: boolean }>;
    locale: InterviewLocale;
    onChange(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>): void;
}) {
    const levelOptions = [
        { value: '', label: interviewText(locale, 'unknown') },
        ...interviewLevelOptions(locale),
    ];
    return (
        <ul
            className={styles.languageList}
            aria-label={interviewText(locale, 'describeLanguages')}
        >
            {selected.map((id) => (
                <li key={id} className={styles.languageRow}>
                    <strong>
                        {options.find((option) => option.id === id)?.label}
                    </strong>
                    <Select
                        label={interviewText(locale, 'level')}
                        data-language={id}
                        data-field='level'
                        value={values[id]?.level ?? ''}
                        onChange={onChange}
                        options={levelOptions}
                    />
                    <Checkbox
                        label={interviewText(locale, 'learning')}
                        data-language={id}
                        data-field='learning'
                        checked={values[id]?.learning ?? false}
                        onChange={onChange}
                    />
                </li>
            ))}
        </ul>
    );
}
