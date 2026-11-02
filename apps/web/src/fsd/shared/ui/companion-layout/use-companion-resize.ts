import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type RefObject,
    type KeyboardEvent,
    type PointerEvent,
} from 'react';
import {
    companionSizing,
    readCompanionDragBounds,
    useCompanionMeasurements,
} from './use-companion-measurements';

/** Workspace width is a browser preference in pixels; floating geometry is independent. */
export function useCompanionResize(
    resizable: boolean,
    root: RefObject<HTMLDivElement | null>,
) {
    const slot = useRef<HTMLDivElement>(null);
    const [halfWidth, setHalfWidthState] = useState(false);
    const [customWidth, setCustomWidth] = useState<number | null>(null);
    const [preferenceReady, setPreferenceReady] = useState(false);
    const [desktop, setDesktop] = useState(false);
    const [resizing, setResizing] = useState(false);
    const [geometry, setGeometry] = useState({
        width: 0,
        minimum: 0,
        maximum: 0,
        slotWidth: 0,
    });
    const gesture = useRef<{
        pointerId: number;
        width: number | null;
        half: boolean;
    } | null>(null);
    const enabled = resizable && desktop && geometry.width > 0;

    useEffect(() => {
        if (!resizable || preferenceReady) {
            return;
        }

        try {
            const value: unknown = JSON.parse(
                localStorage.getItem('languon.knowledge.width.v1') ?? 'null',
            );

            if (
                typeof value === 'number' &&
                Number.isFinite(value) &&
                value > 0 &&
                value <= 10000
            ) {
                setCustomWidth(value);
            }
        } catch {
            /* Resizing works without browser storage. */
        }

        setPreferenceReady(true);
    }, [resizable, preferenceReady]);

    useEffect(() => {
        if (!preferenceReady) {
            return;
        }

        try {
            localStorage.setItem(
                'languon.knowledge.width.v1',
                JSON.stringify(customWidth),
            );
        } catch {
            /* The preference remains available for this mount. */
        }
    }, [preferenceReady, customWidth]);

    useCompanionMeasurements(resizable, root, slot, setGeometry, setDesktop);

    useEffect(() => {
        if (enabled) {
            return;
        }

        const current = gesture.current;
        if (current) {
            setCustomWidth(current.width);
            setHalfWidthState(current.half);
        }

        gesture.current = null;
        setResizing(false);
    }, [enabled]);

    const setHalfWidth = useCallback((value: boolean) => {
        gesture.current = null;
        setResizing(false);
        setCustomWidth(null);
        setHalfWidthState(value);
    }, []);

    function resize(width: number) {
        const area = readCompanionDragBounds(root);
        if (!area || area.rect.width <= 0) {
            return;
        }

        const percent = Math.min(
            (area.maximum / area.rect.width) * 100,
            Math.max(
                (area.minimum / area.rect.width) * 100,
                (width / area.rect.width) * 100,
            ),
        );

        setCustomWidth((percent / 100) * area.rect.width);
        setHalfWidthState(percent === 50);
    }

    function pointerDown(event: PointerEvent<HTMLDivElement>) {
        if (!enabled || event.button !== 0 || gesture.current) {
            return;
        }

        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        gesture.current = {
            pointerId: event.pointerId,
            width: customWidth,
            half: halfWidth,
        };

        setResizing(true);
    }

    function pointerMove(event: PointerEvent<HTMLDivElement>) {
        if (gesture.current?.pointerId !== event.pointerId) {
            return;
        }

        const area = readCompanionDragBounds(root);
        if (!area) {
            return;
        }

        resize(
            area.rtl
                ? event.clientX - area.rect.left
                : area.rect.right - event.clientX,
        );
    }

    function pointerUp(event: PointerEvent<HTMLDivElement>) {
        if (gesture.current?.pointerId !== event.pointerId) {
            return;
        }

        gesture.current = null;
        setResizing(false);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    }

    function cancel() {
        const current = gesture.current;
        if (!current) {
            return;
        }

        setCustomWidth(current.width);
        setHalfWidthState(current.half);
        gesture.current = null;
        setResizing(false);
    }

    function pointerCancel(event: PointerEvent<HTMLDivElement>) {
        if (gesture.current?.pointerId !== event.pointerId) {
            return;
        }

        cancel();
    }

    function keyDown(event: KeyboardEvent<HTMLDivElement>) {
        if (event.key === 'Escape' && gesture.current) {
            event.preventDefault();
            cancel();

            return;
        }

        const area = readCompanionDragBounds(root);
        if (!enabled || !area) {
            return;
        }

        let width = slot.current?.getBoundingClientRect().width ?? 0;
        const increase = area.rtl ? 'ArrowRight' : 'ArrowLeft';
        const decrease = area.rtl ? 'ArrowLeft' : 'ArrowRight';
        const step = event.shiftKey ? 40 : 16;
        if (event.key === increase) {
            width += step;
        } else if (event.key === decrease) {
            width -= step;
        } else if (event.key === 'Home') {
            width = area.minimum;
        } else if (event.key === 'End') {
            width = area.maximum;
        } else {
            return;
        }

        event.preventDefault();
        resize(width);
    }

    const { minimumPercent, maximumPercent, currentPercent, style } =
        companionSizing(geometry, halfWidth, customWidth);

    return {
        root,
        slot,
        halfWidth,
        setHalfWidth,
        enabled,
        resizing,
        style,
        minimumPercent,
        maximumPercent,
        currentPercent,
        pointerDown,
        pointerMove,
        pointerUp,
        pointerCancel,
        keyDown,
    };
}
