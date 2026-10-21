import type { ChangeEvent } from 'react';
import type { PortraitInterviewerOutput } from '@languon/contracts';
import { interviewText, type InterviewLocale } from '../../lib/interview-copy';
import { InterviewChoice } from './interview-choice';
import styles from './portrait-interview.module.css';
export function InterviewOptionGroup({
    question,
    locale,
    selected,
    busy,
    onChange,
}: {
    question: PortraitInterviewerOutput;
    locale: InterviewLocale;
    selected: string[];
    busy: boolean;
    onChange(event: ChangeEvent<HTMLInputElement>): void;
}) {
    if (question.topic === 'style' || question.options.length === 0)
        return null;
    let label = interviewText(locale, question.topic);
    if (question.topic === 'languages')
        label = interviewText(locale, 'knownLanguages');
    if (question.topic === 'explanation-languages')
        label = interviewText(locale, 'comfortableLanguages');
    if (question.topic === 'accommodations')
        label = interviewText(locale, 'helpfulApproaches');
    return (
        <fieldset className={styles.fieldset}>
            <legend>{label}</legend>
            {question.multiSelect ? (
                <p className={styles.optionHelp}>
                    {interviewText(locale, 'selectAll')}
                </p>
            ) : null}
            <div className={styles.fieldChoices}>
                {question.options.map((option) => (
                    <InterviewChoice
                        key={option.id}
                        label={option.label}
                        multiple={question.multiSelect}
                        name='interview-option'
                        value={option.id}
                        checked={selected.includes(option.id)}
                        onChange={onChange}
                        disabled={busy}
                    />
                ))}
            </div>
        </fieldset>
    );
}
