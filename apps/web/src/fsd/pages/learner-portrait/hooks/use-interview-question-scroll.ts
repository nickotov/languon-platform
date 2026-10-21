'use client';
import { useEffect, useRef } from 'react';

/** Preserve the source's next-question scroll while accounting for the sticky composer. */
export function useInterviewQuestionScroll(
    messageCount: number,
    busy: boolean,
) {
    const first = useRef(true);
    useEffect(() => {
        if (first.current) {
            first.current = false;
            return;
        }
        if (busy) return;
        const question = document.querySelector<HTMLElement>(
            '[aria-label="Current question"]',
        );
        if (
            !question ||
            question.closest('[hidden]') ||
            typeof question.scrollIntoView !== 'function'
        )
            return;
        const frame = requestAnimationFrame(() => {
            question.scrollIntoView({ block: 'nearest' });
            const actions = question.querySelector<HTMLElement>(
                '[data-interview-question-actions]',
            );
            const composer = document.querySelector<HTMLElement>(
                '[aria-label="Message the interviewer"]',
            );
            if (
                actions &&
                composer &&
                actions.getBoundingClientRect().bottom >
                    composer.getBoundingClientRect().top
            )
                actions.scrollIntoView({ block: 'end' });
        });
        return () => cancelAnimationFrame(frame);
    }, [busy, messageCount]);
}
