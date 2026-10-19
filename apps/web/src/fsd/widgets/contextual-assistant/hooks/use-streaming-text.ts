import { useCallback, useEffect, useRef, useState } from 'react';

const frameMs = 20;
const revealMs = 180;
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Only reveal valid grapheme boundaries; the backlog drains within a short window. */
export function nextStreamingPrefix(
    target: string,
    visible: string,
    steps: number,
) {
    if (!target.startsWith(visible)) return target;
    const budget = Math.max(
        1,
        Math.ceil((target.length - visible.length) / steps),
    );
    for (const part of graphemes.segment(target.slice(visible.length))) {
        const end = part.index + part.segment.length;
        if (end >= budget) return target.slice(0, visible.length + end);
    }
    return target;
}

/** Presentation only: history/terminal/corrected text is immediate; live bursts are bounded. */
export function useStreamingText(content: string, streaming: boolean) {
    const [visible, setVisible] = useState(content);
    const [reduced, setReduced] = useState(false);
    const displayed = useRef(content);
    const target = useRef(content);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const deadline = useRef(0);
    // Stable identity is required by the visibility/motion subscriptions below.
    const flush = useCallback(() => {
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = null;
        displayed.current = target.current;
        setVisible(target.current);
    }, []);

    useEffect(() => {
        const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
        function preference() {
            setReduced(motion.matches);
        }
        function visibility() {
            if (document.hidden) flush();
        }
        preference();
        motion.addEventListener('change', preference);
        document.addEventListener('visibilitychange', visibility);
        return () => {
            if (timer.current !== null) clearTimeout(timer.current);
            motion.removeEventListener('change', preference);
            document.removeEventListener('visibilitychange', visibility);
        };
    }, [flush]);

    useEffect(() => {
        target.current = content;
        if (
            !streaming ||
            reduced ||
            document.hidden ||
            !content.startsWith(displayed.current)
        ) {
            flush();
            return;
        }
        function tick() {
            const steps = Math.max(
                1,
                Math.ceil((deadline.current - performance.now()) / frameMs),
            );
            displayed.current = nextStreamingPrefix(
                target.current,
                displayed.current,
                steps,
            );
            setVisible(displayed.current);
            timer.current = null;
            if (displayed.current !== target.current)
                timer.current = setTimeout(tick, frameMs);
        }
        // New chunks update the target without cancelling the scheduled frame.
        // Otherwise a fast provider could starve painting until generation ends.
        if (displayed.current !== content && timer.current === null) {
            deadline.current = performance.now() + revealMs;
            timer.current = setTimeout(tick, frameMs);
        }
    }, [content, streaming, reduced, flush]);
    return streaming ? visible : content;
}
