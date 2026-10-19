import { useEffect, useState } from 'react';

export function useSourceSelection(rootId?: string) {
    const [selection, setSelection] = useState<{
        text: string;
        top: number;
        left: number;
    } | null>(null);
    useEffect(() => {
        if (!rootId) return;
        let timer: ReturnType<typeof setTimeout>;
        function read() {
            const root = document.getElementById(rootId!);
            const selected = window.getSelection();
            if (
                !root ||
                !selected ||
                selected.isCollapsed ||
                !selected.rangeCount ||
                !selected.anchorNode ||
                !selected.focusNode ||
                !root.contains(selected.anchorNode) ||
                !root.contains(selected.focusNode)
            ) {
                setSelection(null);
                return;
            }
            const text = selected.toString().trim();
            if (text.length < 2) {
                setSelection(null);
                return;
            }
            const rect = selected.getRangeAt(0).getBoundingClientRect();
            const mobile = window.matchMedia('(max-width: 1023px)').matches;
            const above = rect.top - 48;
            setSelection({
                text,
                top: mobile || above < 8 ? rect.bottom + 10 : above,
                left: Math.max(
                    8,
                    Math.min(
                        window.innerWidth - 260,
                        rect.left + rect.width / 2 - 126,
                    ),
                ),
            });
        }
        function schedule() {
            clearTimeout(timer);
            timer = setTimeout(read, 140);
        }
        document.addEventListener('selectionchange', schedule);
        window.addEventListener('scroll', schedule, true);
        window.addEventListener('resize', schedule);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('selectionchange', schedule);
            window.removeEventListener('scroll', schedule, true);
            window.removeEventListener('resize', schedule);
        };
    }, [rootId]);
    return selection;
}
