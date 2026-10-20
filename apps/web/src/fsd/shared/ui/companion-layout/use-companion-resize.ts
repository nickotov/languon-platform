import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type CSSProperties,
    type RefObject,
    type KeyboardEvent,
    type PointerEvent,
} from 'react';

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
        if (!resizable || preferenceReady) return;
        try {
            const value: unknown = JSON.parse(
                localStorage.getItem('languon.knowledge.width.v1') ?? 'null',
            );
            if (
                typeof value === 'number' &&
                Number.isFinite(value) &&
                value > 0 &&
                value <= 10000
            )
                setCustomWidth(value);
        } catch {
            /* Resizing works without browser storage. */
        }
        setPreferenceReady(true);
    }, [resizable, preferenceReady]);
    useEffect(() => {
        if (!preferenceReady) return;
        try {
            localStorage.setItem(
                'languon.knowledge.width.v1',
                JSON.stringify(customWidth),
            );
        } catch {
            /* The preference remains available for this mount. */
        }
    }, [preferenceReady, customWidth]);

    useEffect(() => {
        const element = root.current;
        if (!element || !resizable) return;
        const query = window.matchMedia('(min-width: 1280px)');
        function measure() {
            const width = element!.getBoundingClientRect().width;
            const font = Number.parseFloat(
                getComputedStyle(document.documentElement).fontSize,
            );
            // 340 reference pixels = 21.25rem, matching the canonical geometry scale.
            setGeometry({
                width,
                minimum: Math.min(font * 21.25, width / 2),
                maximum: Math.max(
                    Math.min(font * 21.25, width / 2),
                    Math.min(font * 35, width - font * 30),
                ),
                slotWidth: slot.current?.getBoundingClientRect().width ?? 0,
            });
            setDesktop(query.matches);
        }
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        if (slot.current) observer.observe(slot.current);
        query.addEventListener('change', measure);
        measure();
        return () => {
            observer.disconnect();
            query.removeEventListener('change', measure);
        };
    }, [resizable]);

    useEffect(() => {
        if (enabled) return;
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

    function bounds() {
        const element = root.current;
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        const font = Number.parseFloat(
            getComputedStyle(document.documentElement).fontSize,
        );
        return {
            rect,
            minimum: Math.min(font * 21.25, rect.width / 2),
            maximum: Math.max(
                Math.min(font * 21.25, rect.width / 2),
                Math.min(font * 35, rect.width - font * 30),
            ),
            rtl: getComputedStyle(element).direction === 'rtl',
        };
    }
    function resize(width: number) {
        const area = bounds();
        if (!area || area.rect.width <= 0) return;
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
        if (!enabled || event.button !== 0 || gesture.current) return;
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
        if (gesture.current?.pointerId !== event.pointerId) return;
        const area = bounds();
        if (!area) return;
        resize(
            area.rtl
                ? event.clientX - area.rect.left
                : area.rect.right - event.clientX,
        );
    }
    function pointerUp(event: PointerEvent<HTMLDivElement>) {
        if (gesture.current?.pointerId !== event.pointerId) return;
        gesture.current = null;
        setResizing(false);
        if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
    }
    function cancel() {
        const current = gesture.current;
        if (!current) return;
        setCustomWidth(current.width);
        setHalfWidthState(current.half);
        gesture.current = null;
        setResizing(false);
    }
    function pointerCancel(event: PointerEvent<HTMLDivElement>) {
        if (gesture.current?.pointerId !== event.pointerId) return;
        cancel();
    }
    function keyDown(event: KeyboardEvent<HTMLDivElement>) {
        if (event.key === 'Escape' && gesture.current) {
            event.preventDefault();
            cancel();
            return;
        }
        const area = bounds();
        if (!enabled || !area) return;
        let width = slot.current?.getBoundingClientRect().width ?? 0;
        const increase = area.rtl ? 'ArrowRight' : 'ArrowLeft';
        const decrease = area.rtl ? 'ArrowLeft' : 'ArrowRight';
        const step = event.shiftKey ? 40 : 16;
        if (event.key === increase) width += step;
        else if (event.key === decrease) width -= step;
        else if (event.key === 'Home') width = area.minimum;
        else if (event.key === 'End') width = area.maximum;
        else return;
        event.preventDefault();
        resize(width);
    }

    const minimumPercent =
        geometry.width > 0 ? (geometry.minimum / geometry.width) * 100 : 0;
    let percent = halfWidth
        ? 50
        : customWidth !== null && geometry.width > 0
          ? (customWidth / geometry.width) * 100
          : null;
    if (percent === null && geometry.width > 0)
        percent = (geometry.slotWidth / geometry.width) * 100;
    const maximumPercent =
        geometry.width > 0 ? (geometry.maximum / geometry.width) * 100 : 50;
    const currentPercent = Math.min(
        halfWidth ? 50 : maximumPercent,
        Math.max(minimumPercent, percent ?? minimumPercent),
    );
    const style =
        customWidth === null
            ? undefined
            : ({
                  '--companion-width': `${currentPercent}%`,
              } as CSSProperties);
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
