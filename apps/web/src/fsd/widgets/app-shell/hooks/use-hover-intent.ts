import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type PointerEvent,
} from 'react';
export function useHoverIntent() {
    const [open, setOpenState] = useState(false);
    const [pinned, setPinned] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const clear = useCallback(() => window.clearTimeout(timer.current), []);
    const setOpen = useCallback(
        (next: boolean, pin = true) => {
            clear();
            setPinned(next && pin);
            setOpenState(next);
        },
        [clear],
    );
    function onPointerEnter(event: PointerEvent) {
        if (event.pointerType !== 'mouse') return;
        clear();
        if (!open) timer.current = setTimeout(() => setOpen(true, false), 180);
    }
    function onPointerLeave(event: PointerEvent) {
        if (event.pointerType !== 'mouse') return;
        clear();
        if (!pinned) timer.current = setTimeout(() => setOpen(false), 240);
    }
    useEffect(() => clear, [clear]);
    return { open, pinned, setOpen, onPointerEnter, onPointerLeave };
}
