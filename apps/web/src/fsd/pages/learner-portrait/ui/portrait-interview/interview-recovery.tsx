'use client';
import { useState, type ChangeEvent } from 'react';
import {
    portraitCharacterCount,
    type PortraitInterviewLastAttempt,
    type PortraitInterviewSubmissionSchema,
} from '@languon/contracts';
import type { z } from 'zod';
import { Button, Checkbox, Textarea } from '@/fsd/shared/ui';
import {
    interviewText,
    interviewErrorMessage,
    type InterviewLocale,
} from '../../lib/interview-copy';
import styles from './portrait-interview.module.css';
export function InterviewRecovery({
    attempt,
    locale,
    busy,
    onSubmit,
    onDismiss,
}: {
    attempt: PortraitInterviewLastAttempt;
    locale: InterviewLocale;
    busy: boolean;
    onSubmit(
        input: z.infer<typeof PortraitInterviewSubmissionSchema>,
    ): Promise<boolean>;
    onDismiss(): void;
}) {
    const input = attempt.input;
    const [text, setText] = useState(
        input.kind === 'skip' ? '' : (input.text ?? ''),
    );
    const [selected, setSelected] = useState(
        input.kind === 'answer' ? (input.selected ?? []) : [],
    );
    const maximum = input.kind === 'chat' ? 1000 : 200;
    const count = portraitCharacterCount(text);
    const over = count > maximum;
    const empty = input.kind !== 'skip' && !text.trim() && !selected.length;
    function changeText(event: ChangeEvent<HTMLTextAreaElement>) {
        setText(event.target.value);
    }
    function changeSelected(event: ChangeEvent<HTMLInputElement>) {
        const value = event.target.value;
        setSelected((previous) =>
            event.target.checked
                ? [...previous, value]
                : previous.filter((item) => item !== value),
        );
    }
    async function retry() {
        if (over || empty || busy) return;
        if (input.kind === 'skip') {
            await onSubmit({ kind: 'skip', topic: input.topic });
            return;
        }
        if (input.kind === 'chat') {
            await onSubmit({
                kind: 'chat',
                topic: input.topic,
                text: text.trim(),
            });
            return;
        }
        await onSubmit({
            kind: 'answer',
            topic: input.topic,
            ...(text.trim() ? { text: text.trim() } : {}),
            ...(selected.length ? { selected } : {}),
        });
    }
    return (
        <section
            className={styles.question}
            aria-label={interviewText(locale, 'recoveredAnswer')}
        >
            <p className={styles.eyebrow}>
                {interviewText(locale, 'recoveredAnswer')} ·{' '}
                {interviewText(locale, input.topic)}
            </p>
            <h2 className={styles.questionTitle}>
                {interviewText(locale, 'recoveryTitle')}
            </h2>
            <p className={styles.meta}>
                {interviewErrorMessage(
                    locale,
                    attempt.errorCode ?? 'cancelled',
                )}
            </p>
            {input.kind === 'answer' && input.selected?.length ? (
                <div className={styles.recoveredChoices}>
                    {input.selected.map((value) => (
                        <Checkbox
                            key={value}
                            label={value}
                            value={value}
                            checked={selected.includes(value)}
                            onChange={changeSelected}
                            disabled={busy}
                        />
                    ))}
                </div>
            ) : null}
            {input.kind !== 'skip' ? (
                <>
                    <Textarea
                        label={interviewText(locale, 'recoveredAnswer')}
                        value={text}
                        onChange={changeText}
                        rows={3}
                        aria-invalid={over}
                        disabled={busy}
                    />
                    <p className={over ? styles.limitError : styles.meta}>
                        {count}/{maximum}
                    </p>
                </>
            ) : null}
            {attempt.stale ? (
                <p className={styles.meta}>
                    {interviewText(locale, 'recoveryStale')}
                </p>
            ) : null}
            <p className={styles.meta}>
                {interviewText(locale, 'recoveryCost')}
            </p>
            <div className={styles.actions}>
                <Button variant='ghost' onClick={onDismiss} disabled={busy}>
                    {interviewText(locale, 'dismiss')}
                </Button>
                <Button onClick={retry} disabled={busy || over || empty}>
                    {interviewText(locale, 'retryAnswer')}
                </Button>
            </div>
        </section>
    );
}
