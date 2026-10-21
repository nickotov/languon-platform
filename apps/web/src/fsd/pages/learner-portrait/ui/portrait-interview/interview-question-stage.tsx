'use client';
import { useState, type MouseEvent } from 'react';
import type {
    PortraitInterviewerOutput,
    StartPortraitInterviewResponse,
} from '@languon/contracts';
import { Button } from '@/fsd/shared/ui';
import {
    interviewAllTopics,
    interviewCoreTopics,
    interviewText,
} from '../../lib/interview-copy';
import { localInterviewQuestion } from '../../lib/interview-questions';
import { InterviewQuestion } from './interview-question';
import styles from './portrait-interview.module.css';
export function InterviewQuestionStage({
    session,
    question,
    busy,
    optionalAllowed,
    onQuestion,
    onAnswer,
    onSkip,
    onReview,
}: {
    session: StartPortraitInterviewResponse;
    question: PortraitInterviewerOutput;
    optionalAllowed: boolean;
    busy: boolean;
    onQuestion(question: PortraitInterviewerOutput): void;
    onAnswer(value: { selected: string[]; text?: string }): void;
    onSkip(): void;
    onReview(): void;
}) {
    const [deeper, setDeeper] = useState(false);
    const locale = session.context.locale;
    const coreDone = interviewCoreTopics.every((topic) =>
        session.context.completedTopics.includes(topic),
    );
    const offerDeeper =
        !deeper &&
        !optionalAllowed &&
        coreDone &&
        (question.topic === 'hobbies' || question.topic === 'age');
    function goDeeper() {
        setDeeper(true);
        onQuestion(localInterviewQuestion('hobbies', locale));
    }
    function pickTopic(event: MouseEvent<HTMLButtonElement>) {
        const topic = event.currentTarget.dataset
            .topic as PortraitInterviewerOutput['topic'];
        onQuestion(localInterviewQuestion(topic, locale));
        setDeeper(topic === 'hobbies' || topic === 'age');
    }
    const topics = interviewAllTopics.map((topic) => ({
        topic,
        label: interviewText(locale, topic),
    }));
    const questionKey = `${question.topic}-${locale}-${session.context.messages.length}`;
    if (question.topic === 'update')
        return (
            <section className={styles.question}>
                <h2>{question.message}</h2>
                <div className={styles.choices}>
                    {topics.map(({ topic, label }) => (
                        <Button
                            key={topic}
                            data-topic={topic}
                            onClick={pickTopic}
                            variant='secondary'
                        >
                            {label}
                        </Button>
                    ))}
                </div>
                <div className={styles.actions}>
                    <Button onClick={onReview}>
                        {interviewText(locale, 'review')}
                    </Button>
                </div>
            </section>
        );
    if (offerDeeper)
        return (
            <section className={styles.question}>
                <h2>{interviewText(locale, 'deeper')}</h2>
                <p>{interviewText(locale, 'deeperHelp')}</p>
                <div className={styles.actions}>
                    <Button variant='secondary' onClick={onReview}>
                        {interviewText(locale, 'review')}
                    </Button>
                    <Button onClick={goDeeper}>
                        {interviewText(locale, 'next')}
                    </Button>
                </div>
            </section>
        );
    if (session.context.completedTopics.includes('age'))
        return (
            <section className={styles.question}>
                <h2>{interviewText(locale, 'done')}</h2>
                <div className={styles.actions}>
                    <Button onClick={onReview}>
                        {interviewText(locale, 'review')}
                    </Button>
                </div>
            </section>
        );
    return (
        <InterviewQuestion
            key={questionKey}
            question={question}
            locale={locale}
            busy={busy}
            onAnswer={onAnswer}
            onSkip={onSkip}
        />
    );
}
