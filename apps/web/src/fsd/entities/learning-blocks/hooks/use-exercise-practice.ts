import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { LearningBlockViewProps } from '../types';

/** Hydrate a private saved attempt once without overwriting an answer being edited. */
export function useExercisePractice(
    saved: LearningBlockViewProps['learnerState'],
) {
    const edited = useRef(false);
    const [answer, setAnswer] = useState(
        typeof saved?.answer === 'string' ? saved.answer : '',
    );
    const [gaps, setGaps] = useState<Record<string, string>>(
        typeof saved?.answer === 'object' ? saved.answer : {},
    );
    const [revealed, setRevealed] = useState(saved?.revealed ?? false);
    const [hintVisible, setHintVisible] = useState(saved?.hintUsed ?? false);
    const [preparedResult, setPreparedResult] = useState<boolean>();
    const [attempted, setAttempted] = useState(saved?.attempted ?? false);

    useEffect(() => {
        if (edited.current || !saved) return;
        setAnswer(typeof saved.answer === 'string' ? saved.answer : '');
        setGaps(typeof saved.answer === 'object' ? saved.answer : {});
        setRevealed(saved.revealed);
        setHintVisible(saved.hintUsed);
        setAttempted(saved.attempted);
    }, [saved]);

    function handleAnswer(
        event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) {
        edited.current = true;
        setAnswer(event.target.value);
        setPreparedResult(undefined);
    }
    function handleGap(event: ChangeEvent<HTMLInputElement>) {
        edited.current = true;
        setGaps({ ...gaps, [event.target.name]: event.target.value });
        setPreparedResult(undefined);
    }
    function reveal() {
        edited.current = true;
        setRevealed(true);
    }
    function toggleHint() {
        edited.current = true;
        setHintVisible(!hintVisible);
    }
    function retry() {
        edited.current = true;
        setAnswer('');
        setGaps({});
        setRevealed(false);
        setHintVisible(false);
        setPreparedResult(undefined);
        setAttempted(
            (previous) => saved !== undefined && (previous || saved.attempted),
        );
    }
    function markAttempted() {
        edited.current = true;
        setAttempted(true);
    }
    return {
        answer,
        gaps,
        revealed,
        hintVisible,
        preparedResult,
        attempted,
        markAttempted,
        setPreparedResult,
        handleAnswer,
        handleGap,
        reveal,
        toggleHint,
        retry,
    };
}
