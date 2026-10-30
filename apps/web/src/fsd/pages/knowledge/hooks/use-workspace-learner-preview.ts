import { useEffect, useRef, useState } from 'react';

/** Capture scroll before hiding the editor can clamp its scroll container. */
export function useWorkspaceLearnerPreview() {
    const [active, setActive] = useState(false);
    const editorScroll = useRef(0);
    const frame = useRef<number | null>(null);
    useEffect(() => {
        return () => {
            if (frame.current !== null) cancelAnimationFrame(frame.current);
        };
    }, []);
    function change(next: boolean) {
        if (next === active) return;
        const editor = document.getElementById('knowledge-workspace-editor');
        const scroll = editor?.closest<HTMLElement>('[data-workspace-scroll]');
        if (next) editorScroll.current = scroll?.scrollTop ?? 0;
        setActive(next);
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() => {
            frame.current = null;
            scroll?.scrollTo({
                top: next ? 0 : editorScroll.current,
                behavior: 'instant',
            });
            if (!next)
                editor
                    ?.querySelector<HTMLElement>('[role="textbox"]')
                    ?.focus({ preventScroll: true });
        });
    }
    function close() {
        change(false);
    }
    return { active, change, close };
}
