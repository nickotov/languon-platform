import { useLayoutEffect, useEffect, useRef, useState } from 'react';

export function useMessageScroll(identity: string, signature: string) {
    const ref = useRef<HTMLDivElement>(null);
    const follow = useRef(true);
    const position = useRef(0);
    const [showJump, setShowJump] = useState(false);
    function selected() {
        const selection = window.getSelection();
        return Boolean(
            selection &&
            !selection.isCollapsed &&
            selection.anchorNode &&
            ref.current?.contains(selection.anchorNode),
        );
    }
    function nearBottom() {
        const node = ref.current;
        return (
            !node || node.scrollHeight - node.scrollTop - node.clientHeight < 56
        );
    }
    function onScroll() {
        if (!ref.current?.clientHeight) return;
        position.current = ref.current.scrollTop;
        follow.current = nearBottom() && !selected();
        if (nearBottom()) setShowJump(false);
    }
    function jump() {
        const node = ref.current;
        if (!node) return;
        follow.current = true;
        node.scrollTop = node.scrollHeight;
        position.current = node.scrollTop;
        setShowJump(false);
    }
    useLayoutEffect(jump, [identity]);
    useLayoutEffect(() => {
        const node = ref.current;
        if (!node?.clientHeight) return;
        if (follow.current && !selected()) node.scrollTop = node.scrollHeight;
        else if (!nearBottom()) setShowJump(true);
        position.current = node.scrollTop;
    }, [signature]);
    useEffect(() => {
        const node = ref.current;
        if (!node || typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(() => {
            if (!node.clientHeight) return;
            node.scrollTop =
                follow.current && !selected()
                    ? node.scrollHeight
                    : position.current;
            if (!nearBottom()) setShowJump(true);
        });
        observer.observe(node);
        // Local streaming reveal grows the transcript without resizing its viewport.
        if (node.firstElementChild) observer.observe(node.firstElementChild);
        return () => observer.disconnect();
    }, [identity]);
    useEffect(() => {
        function selectionChanged() {
            if (selected()) follow.current = false;
        }
        document.addEventListener('selectionchange', selectionChanged);
        return () =>
            document.removeEventListener('selectionchange', selectionChanged);
    }, []);
    return { ref, onScroll, showJump, jump };
}
