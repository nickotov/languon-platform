'use client';
import {
    useEffect,
    useRef,
    useState,
    type KeyboardEvent,
    type PointerEvent,
} from 'react';

/** Geometry is measured in the available app area, including the live sidebar offset. */
export function useTutorLayout(onFold: () => void, hasSlot = false) {
    const areaRef = useRef<HTMLDivElement>(null);
    const [area, setArea] = useState({
        width: 1000,
        height: 800,
        viewportHeight: 800,
        viewportWidth: 1000,
    });
    const [mobile, setMobile] = useState(false);
    const [keyboardInset, setKeyboardInset] = useState(0);
    const [dock, setDock] = useState<'left' | 'right'>('right');
    const [wide, setWide] = useState(false);
    const [full, setFull] = useState(true);
    const [sheetFull, setSheetFull] = useState(true);
    const [customHeight, setCustomHeight] = useState<number | null>(null);
    const [dragX, setDragX] = useState(0);
    const [sheetHeight, setSheetHeight] = useState<number | null>(null);
    const gesture = useRef<{
        kind: 'dock' | 'resize' | 'sheet';
        x: number;
        y: number;
        height: number;
        lastY: number;
        lastTime: number;
        velocity: number;
    } | null>(null);
    const suppressClick = useRef(false);
    const attached = hasSlot && area.viewportWidth >= 1024;
    const canWiden = area.width >= 900;
    const width = Math.min(wide && canWiden ? 560 : 420, area.width - 48);
    const maxHeight = Math.max(120, area.height - 40);
    const minHeight = Math.min(340, maxHeight);
    const defaultHeight = Math.min(wide && canWiden ? 680 : 600, maxHeight);
    const desktopHeight = full
        ? maxHeight
        : Math.max(
              minHeight,
              Math.min(customHeight ?? defaultHeight, maxHeight),
          );
    const fullHeight = Math.max(120, area.height - keyboardInset - 12);
    const partialHeight = Math.min(
        Math.max(120, fullHeight - 48),
        Math.round(area.viewportHeight * 0.75),
    );
    const mobileHeight =
        keyboardInset > 0 || sheetFull ? fullHeight : partialHeight;
    const height = mobile ? (sheetHeight ?? mobileHeight) : desktopHeight;

    useEffect(() => {
        const element = areaRef.current;
        if (!element) return;
        const query = window.matchMedia('(max-width: 767px)');
        function measure() {
            if (!element) return;
            const bounds = element.getBoundingClientRect();
            setArea({
                width: bounds.width,
                height: bounds.height,
                viewportHeight: window.innerHeight,
                viewportWidth: window.innerWidth,
            });
            setMobile(query.matches);
            const viewport = window.visualViewport;
            setKeyboardInset(
                viewport
                    ? Math.max(
                          0,
                          window.innerHeight -
                              viewport.height -
                              viewport.offsetTop,
                      )
                    : 0,
            );
        }
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        query.addEventListener('change', measure);
        window.visualViewport?.addEventListener('resize', measure);
        window.visualViewport?.addEventListener('scroll', measure);
        measure();
        return () => {
            observer.disconnect();
            query.removeEventListener('change', measure);
            window.visualViewport?.removeEventListener('resize', measure);
            window.visualViewport?.removeEventListener('scroll', measure);
        };
    }, []);

    function setHeight(value: number) {
        const next = Math.max(minHeight, Math.min(value, maxHeight));
        setCustomHeight(next);
        setFull(next >= maxHeight);
    }
    function start(
        event: PointerEvent<HTMLElement>,
        kind: 'dock' | 'resize' | 'sheet',
    ) {
        if (event.button !== 0) return;
        gesture.current = {
            kind,
            x: event.clientX,
            y: event.clientY,
            height,
            lastY: event.clientY,
            lastTime: performance.now(),
            velocity: 0,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
    }
    function onHeaderPointerDown(event: PointerEvent<HTMLElement>) {
        if (attached) return;
        if ((event.target as Element).closest('button, a, input, textarea'))
            return;
        event.preventDefault();
        start(event, mobile ? 'sheet' : 'dock');
    }
    function onHandlePointerDown(event: PointerEvent<HTMLElement>) {
        start(event, 'sheet');
    }
    function onResizePointerDown(event: PointerEvent<HTMLElement>) {
        event.preventDefault();
        start(event, 'resize');
    }
    function onPointerMove(event: PointerEvent<HTMLElement>) {
        const current = gesture.current;
        if (!current) return;
        const delta = event.clientY - current.y;
        const now = performance.now();
        current.velocity =
            (event.clientY - current.lastY) /
            Math.max(1, now - current.lastTime);
        current.lastY = event.clientY;
        current.lastTime = now;
        if (current.kind === 'dock') setDragX(event.clientX - current.x);
        if (current.kind === 'resize') setHeight(current.height + delta);
        if (current.kind === 'sheet')
            setSheetHeight(
                Math.max(120, Math.min(fullHeight, current.height - delta)),
            );
    }
    function onPointerUp(event: PointerEvent<HTMLElement>) {
        const current = gesture.current;
        gesture.current = null;
        if (!current) return;
        if (current.kind === 'dock') {
            const left = dock === 'right' ? area.width - 24 - width : 24;
            setDock(
                left + event.clientX - current.x + width / 2 < area.width / 2
                    ? 'left'
                    : 'right',
            );
        }
        if (
            current.kind === 'sheet' &&
            Math.abs(event.clientY - current.y) > 6
        ) {
            suppressClick.current = true;
            window.setTimeout(() => {
                suppressClick.current = false;
            }, 0);
            const releasedHeight = Math.max(
                120,
                Math.min(
                    fullHeight,
                    current.height - (event.clientY - current.y),
                ),
            );
            if (
                current.velocity > 0.7 ||
                releasedHeight < partialHeight * 0.6
            ) {
                if (sheetFull && releasedHeight > partialHeight * 0.6)
                    setSheetFull(false);
                else onFold();
            } else {
                setSheetFull(
                    current.velocity < -0.7 ||
                        releasedHeight > (partialHeight + fullHeight) / 2,
                );
            }
        }
        setSheetHeight(null);
        setDragX(0);
    }
    function onPointerCancel() {
        gesture.current = null;
        setDragX(0);
        setSheetHeight(null);
    }
    function onResizeKeyDown(event: KeyboardEvent<HTMLElement>) {
        const step = event.shiftKey ? 120 : 40;
        if (event.key === 'ArrowDown') setHeight(height + step);
        else if (event.key === 'ArrowUp') setHeight(height - step);
        else if (event.key === 'End') setFull(true);
        else if (event.key === 'Home') {
            setFull(false);
            setCustomHeight(null);
        } else return;
        event.preventDefault();
    }
    function toggleSheet() {
        if (!suppressClick.current) setSheetFull(!sheetFull);
    }
    function toggleWide() {
        setWide(!wide);
    }
    function toggleFull() {
        setFull(!full);
    }
    function switchDock() {
        setDock(dock === 'right' ? 'left' : 'right');
    }
    return {
        areaRef,
        attached,
        mobile,
        dock,
        wide,
        full,
        sheetFull,
        canWiden,
        width,
        height,
        minHeight,
        maxHeight,
        dragX,
        keyboardInset,
        toggleSheet,
        toggleWide,
        toggleFull,
        switchDock,
        onHeaderPointerDown,
        onHandlePointerDown,
        onResizePointerDown,
        onPointerMove,
        onPointerUp,
        onPointerCancel,
        onResizeKeyDown,
    };
}
