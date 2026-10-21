'use client';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import {
    portraitCharacterCount,
    type PortraitInterviewerOutput,
} from '@languon/contracts';
import { ArrowRight, SkipForward } from 'lucide-react';
import { Button, Input } from '@/fsd/shared/ui';
import {
    interviewLevelOptions,
    interviewText,
    type InterviewLocale,
} from '../../lib/interview-copy';
import {
    InterviewPreferenceFields,
    InterviewMixingField,
} from './interview-preference-fields';
import {
    interviewQuestionHelp,
    interviewAnswerPlaceholder,
} from '../../lib/interview-questions';
import { InterviewOptionGroup } from './interview-option-group';
import { InterviewLanguageFields } from './interview-language-fields';
import styles from './portrait-interview.module.css';

type Answer = { selected: string[]; text?: string };
export function InterviewQuestion({
    question,
    locale,
    busy,
    onAnswer,
    onSkip,
}: {
    question: PortraitInterviewerOutput;
    locale: InterviewLocale;
    busy: boolean;
    onAnswer(answer: Answer): void;
    onSkip(): void;
}) {
    const [selected, setSelected] = useState<string[]>([]);
    const [preferences, setPreferences] = useState<Record<string, string>>({});
    const [mixing, setMixing] = useState('');
    const [custom, setCustom] = useState('');
    const [languages, setLanguages] = useState<
        Record<string, { level: string; learning: boolean }>
    >({});
    const [tried, setTried] = useState(false);
    const count = portraitCharacterCount(custom);
    const over = count > 200;
    function changeCustom(event: ChangeEvent<HTMLInputElement>) {
        setCustom(event.target.value);
    }
    function changeOption(event: ChangeEvent<HTMLInputElement>) {
        const value = event.target.value;
        setSelected((previous) => {
            if (!question.multiSelect) return [value];
            if (previous.includes(value))
                return previous.filter((item) => item !== value);
            const maximum =
                question.topic === 'explanation-languages' ? 11 : 12;
            if (previous.length >= maximum) return previous;
            return [...previous, value];
        });
    }
    function changeLanguage(
        event: ChangeEvent<HTMLSelectElement | HTMLInputElement>,
    ) {
        const key = event.target.dataset.language!;
        const field = event.target.dataset.field;
        setLanguages((previous) => ({
            ...previous,
            [key]: {
                level:
                    field === 'level'
                        ? event.target.value
                        : (previous[key]?.level ?? ''),
                learning:
                    field === 'learning'
                        ? (event.target as HTMLInputElement).checked
                        : (previous[key]?.learning ?? false),
            },
        }));
    }
    function submit(event: FormEvent) {
        event.preventDefault();
        setTried(true);
        if (
            over ||
            (!selected.length &&
                !custom.trim() &&
                !Object.keys(preferences).length &&
                !mixing)
        )
            return;
        const answers = selected.map((id) => {
            const label =
                question.options.find((option) => option.id === id)?.label ??
                id;
            if (question.topic !== 'languages') return label;
            const details = languages[id];
            const levelLabel = interviewLevelOptions(locale).find(
                (option) => option.value === details?.level,
            )?.label;
            return `${label}${levelLabel ? ` · ${levelLabel}` : ''}${details?.learning ? ` · ${interviewText(locale, 'learning')}` : ''}`;
        });
        onAnswer({
            selected: [
                ...answers,
                ...Object.values(preferences),
                ...(mixing ? [mixing] : []),
            ],
            ...(custom.trim() ? { text: custom.trim() } : {}),
        });
    }
    const invalid =
        tried &&
        !selected.length &&
        !custom.trim() &&
        !Object.keys(preferences).length &&
        !mixing;
    const title = interviewText(locale, question.topic);
    const help = interviewQuestionHelp(question.topic, locale);
    const placeholder = interviewAnswerPlaceholder(question.topic, locale);
    const optional = question.topic === 'hobbies' || question.topic === 'age';
    const skipCaption = interviewText(
        locale,
        optional ? 'optional' : 'canSkip',
    );
    return (
        <form
            className={styles.question}
            onSubmit={submit}
            aria-label='Current question'
        >
            <p className={styles.eyebrow}>
                {title} · {skipCaption}
            </p>
            <h2 className={styles.questionTitle}>{question.message}</h2>
            <p className={styles.questionHelp}>{help}</p>
            {question.topic === 'style' ? (
                <InterviewPreferenceFields
                    locale={locale}
                    values={preferences}
                    onChange={setPreferences}
                />
            ) : null}
            <InterviewOptionGroup
                question={question}
                locale={locale}
                selected={selected}
                busy={busy}
                onChange={changeOption}
            />
            {question.topic === 'languages' && selected.length > 0 ? (
                <InterviewLanguageFields
                    selected={selected}
                    options={question.options}
                    values={languages}
                    locale={locale}
                    onChange={changeLanguage}
                />
            ) : null}
            {question.topic === 'explanation-languages' ? (
                <InterviewMixingField
                    locale={locale}
                    value={mixing}
                    onChange={setMixing}
                />
            ) : null}
            {question.topic !== 'age' ? (
                <div className={styles.custom}>
                    <Input
                        label={interviewText(locale, 'custom')}
                        hint={interviewText(locale, 'short')}
                        placeholder={placeholder}
                        value={custom}
                        onChange={changeCustom}
                        aria-invalid={over}
                        disabled={busy}
                    />
                    <p
                        className={over ? styles.limitError : styles.meta}
                        aria-live='polite'
                    >
                        {interviewText(locale, 'customAnswerCount')} · {count} /
                        200
                    </p>
                </div>
            ) : null}
            {invalid ? (
                <p role='alert' className={styles.limitError}>
                    {interviewText(locale, 'invalidAnswer')}
                </p>
            ) : null}
            <div className={styles.actions} data-interview-question-actions>
                <Button
                    type='button'
                    variant='ghost'
                    leadingIcon={<SkipForward size={16} />}
                    onClick={onSkip}
                    disabled={busy}
                >
                    {interviewText(locale, 'skip')}
                </Button>
                <Button
                    type='submit'
                    trailingIcon={<ArrowRight size={16} />}
                    disabled={busy || over}
                >
                    {interviewText(locale, 'next')}
                </Button>
            </div>
        </form>
    );
}
