'use client';
import { useEffect, useState } from 'react';
import type { StartPortraitInterviewResponse } from '@languon/contracts';
const complete = {
    revealed: Number.POSITIVE_INFINITY,
    typing: false,
    done: true,
};
/** Source opening choreography is presentational and never creates AI work. */
export function useInterviewOpening(
    session: StartPortraitInterviewResponse | null,
) {
    const [opening, setOpening] = useState({
        revealed: 0,
        typing: true,
        done: false,
    });
    const interviewId = session?.interviewId;
    const messageCount = session?.context.messages.length ?? 0;
    const returning = session?.context.approvedItems !== null;
    useEffect(() => {
        if (!interviewId) return;
        if (
            messageCount > 0 ||
            window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ) {
            setOpening(complete);
            return;
        }
        setOpening({ revealed: 0, typing: true, done: false });
        const timers: ReturnType<typeof setTimeout>[] = [];
        const total = returning ? 1 : 2;
        let delay = 0;
        for (let i = 1; i <= total; i += 1) {
            delay += i === 1 ? 700 : 900;
            const revealed = i;
            timers.push(
                setTimeout(
                    () => setOpening({ revealed, typing: false, done: false }),
                    delay,
                ),
            );
            if (i < total)
                timers.push(
                    setTimeout(
                        () =>
                            setOpening({ revealed, typing: true, done: false }),
                        delay + 250,
                    ),
                );
        }
        timers.push(setTimeout(() => setOpening(complete), delay + 450));
        return () => timers.forEach(clearTimeout);
    }, [interviewId, messageCount, returning]);
    if (messageCount > 0) return complete;
    return opening;
}
