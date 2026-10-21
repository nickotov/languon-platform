'use client';
import { useEffect, useRef, useState } from 'react';
import {
    type PortraitInterviewerOutput,
    type StartPortraitInterviewResponse,
    type PortraitInterviewSubmissionSchema,
} from '@languon/contracts';
import type { z } from 'zod';
import { interviewAllTopics } from '../lib/interview-copy';
import { localInterviewQuestion } from '../lib/interview-questions';
export function useInterviewQuestion(
    session: StartPortraitInterviewResponse | null,
    submit: (
        input: z.infer<typeof PortraitInterviewSubmissionSchema>,
    ) => Promise<boolean>,
) {
    const [localTopic, setLocalTopic] = useState<
        PortraitInterviewerOutput['topic'] | null
    >(null);
    const requestedFor = useRef<string | null>(null);
    const previousMessages = useRef<number | undefined>(undefined);
    useEffect(() => {
        if (!session) return;
        if (
            previousMessages.current !== undefined &&
            previousMessages.current !== session.context.messages.length
        )
            setLocalTopic(null);
        previousMessages.current = session.context.messages.length;
        if (requestedFor.current === session.interviewId) return;
        requestedFor.current = session.interviewId;
        const requested = new URLSearchParams(window.location.search).get(
            'topic',
        );
        const topic = interviewAllTopics.find((value) => value === requested);
        if (topic) setLocalTopic(topic);
    }, [session]);
    let question: PortraitInterviewerOutput | null = null;
    if (session) question = session.initialQuestion;
    if (
        session?.context.messages.length === 0 &&
        question?.topic === 'languages'
    ) {
        question = {
            ...question,
            options: localInterviewQuestion('languages', session.context.locale)
                .options,
        };
    }
    if (session?.lastAttempt)
        question = localInterviewQuestion(
            session.lastAttempt.input.topic,
            session.context.locale,
        );
    if (session && localTopic)
        question = localInterviewQuestion(localTopic, session.context.locale);
    function setQuestion(value: PortraitInterviewerOutput) {
        setLocalTopic(value.topic);
    }
    async function answer(value: { selected: string[]; text?: string }) {
        if (question)
            await submit({ kind: 'answer', topic: question.topic, ...value });
    }
    async function skip() {
        if (question) await submit({ kind: 'skip', topic: question.topic });
    }
    async function send(text: string) {
        if (!question) return false;
        return submit({ kind: 'chat', topic: question.topic, text });
    }
    function focus() {
        document
            .querySelector<HTMLElement>(
                '[aria-label="Current question"] button, [aria-label="Current question"] input',
            )
            ?.focus();
    }
    return {
        question,
        setQuestion,
        answer,
        skip,
        send,
        focus,
        optionalAllowed: localTopic === 'hobbies' || localTopic === 'age',
    };
}
