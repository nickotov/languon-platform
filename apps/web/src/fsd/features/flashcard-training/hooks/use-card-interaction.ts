import {
    useEffect,
    useRef,
    useState,
    type MouseEvent,
    type PointerEvent,
} from 'react';
import type { Rating } from '../types';

interface Drag {
    x: number;
    y: number;
    id: number;
    axis: 'x' | 'y' | null;
    mouseText: boolean;
}

export function useCardInteraction({
    onFlip,
    onRate,
    disabled,
    itemKey,
    recover = false,
}: {
    onFlip(): void;
    onRate(rating: Rating, beforeAdvance?: Promise<void>): void;
    disabled: boolean;
    itemKey: string;
    recover?: boolean;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const drag = useRef<Drag | null>(null);
    const moved = useRef(false);
    const offset = useRef(0);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const threshold = useRef(100);
    const [dx, setDx] = useState(0);
    const [departing, setDeparting] = useState(false);
    const departure = useRef(false);
    const fade = useRef<{
        timeout: ReturnType<typeof setTimeout>;
        finish(): void;
    } | null>(null);
    const [reducedMotion, setReducedMotion] = useState(false);

    useEffect(() => {
        const query = matchMedia('(prefers-reduced-motion: reduce)');
        function update() {
            setReducedMotion(query.matches);
        }
        update();
        query.addEventListener('change', update);
        return () => query.removeEventListener('change', update);
    }, []);
    useEffect(() => {
        drag.current = null;
        offset.current = 0;
        setDx(0);
        departure.current = false;
        setDeparting(false);
        return () => {
            if (timer.current) clearTimeout(timer.current);
            if (fade.current) {
                clearTimeout(fade.current.timeout);
                fade.current.finish();
                fade.current = null;
            }
        };
    }, [itemKey]);

    useEffect(() => {
        if (!recover) return;
        departure.current = false;
        setDeparting(false);
        setDx(0);
    }, [recover]);

    function onPointerDown(event: PointerEvent<HTMLDivElement>) {
        moved.current = false;
        const target = event.target as HTMLElement;
        if (
            event.button !== 0 ||
            target.closest('button, a, input') ||
            disabled ||
            departure.current
        )
            return;
        threshold.current = Math.min(
            120,
            (ref.current?.offsetWidth ?? 320) * 0.3,
        );
        drag.current = {
            x: event.clientX,
            y: event.clientY,
            id: event.pointerId,
            axis: null,
            mouseText:
                event.pointerType === 'mouse' &&
                Boolean(target.closest('[data-card-text]')),
        };
    }
    function onPointerMove(event: PointerEvent<HTMLDivElement>) {
        const current = drag.current;
        if (!current || current.id !== event.pointerId) return;
        const x = event.clientX - current.x;
        const y = event.clientY - current.y;
        if (!current.axis) {
            if (Math.abs(x) > 12 && Math.abs(x) > Math.abs(y) * 1.2) {
                moved.current = true;
                current.axis = current.mouseText ? 'y' : 'x';
                if (current.axis === 'x')
                    ref.current?.setPointerCapture(event.pointerId);
            } else if (Math.abs(y) > 12) {
                moved.current = true;
                current.axis = 'y';
            } else return;
        }
        if (current.axis === 'x') {
            offset.current = x;
            setDx(x);
        }
    }
    function end(commit: boolean) {
        const current = drag.current;
        drag.current = null;
        const x = offset.current;
        offset.current = 0;
        if (current && ref.current?.hasPointerCapture(current.id))
            ref.current.releasePointerCapture(current.id);
        if (
            commit &&
            !disabled &&
            current?.axis === 'x' &&
            Math.abs(x) >= threshold.current
        ) {
            departure.current = true;
            setDeparting(true);
            // Freeze the actual release transform; only opacity changes on exit.
            setDx(x);
            let beforeAdvance: Promise<void> | undefined;
            if (!reducedMotion) {
                beforeAdvance = new Promise<void>((finish) => {
                    const timeout = setTimeout(() => {
                        fade.current = null;
                        finish();
                    }, 200);
                    fade.current = { timeout, finish };
                });
            }
            onRate(x > 0 ? 'known' : 'again', beforeAdvance);
        } else if (!departure.current) {
            setDx(0);
        }
    }
    function onPointerUp() {
        end(true);
    }
    function onPointerCancel() {
        end(false);
    }
    function onClick(event: MouseEvent<HTMLDivElement>) {
        if (
            moved.current ||
            departure.current ||
            (event.target as HTMLElement).closest('button, a, input')
        )
            return;
        if (timer.current) clearTimeout(timer.current);
        if (event.detail > 1) return;
        timer.current = setTimeout(() => {
            if (!window.getSelection()?.toString()) onFlip();
        }, 220);
    }
    const progress = Math.min(1, Math.abs(dx) / threshold.current);
    const transform = dx
        ? `translateX(${dx}px) rotate(${reducedMotion ? 0 : Math.max(-18, Math.min(18, dx / 40))}deg)`
        : undefined;

    return {
        ref,
        dx,
        departing,
        progress,
        transform,
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerCancel,
        onClick,
    };
}
