import {
    useCallback,
    useLayoutEffect,
    useRef,
    useState,
    type RefObject,
} from 'react';

export type EditorInsertLevel =
    'root' | 'basic' | 'learning' | 'exercises' | 'activity';
type View = {
    level: EditorInsertLevel;
    query: string;
    scroll: number;
    focus: string | null;
};

/** A submenu is a view over one command surface, not another overlay. */
export function useEditorInsertNavigation(
    panel: RefObject<HTMLDivElement | null>,
) {
    const [level, setLevel] = useState<EditorInsertLevel>('root');
    const [query, setQuery] = useState('');
    const history = useRef<View[]>([]);
    const restore = useRef<View | null>(null);

    function enter(next: EditorInsertLevel) {
        const active = document.activeElement;
        const focus =
            active instanceof HTMLElement
                ? (active.getAttribute('aria-label') ?? active.textContent)
                : null;

        history.current.push({
            level,
            query,
            scroll:
                panel.current?.querySelector('[data-command-results]')
                    ?.scrollTop ?? 0,
            focus,
        });

        restore.current = { level: next, query: '', scroll: 0, focus: null };
        setQuery('');
        setLevel(next);
    }

    function back() {
        const previous = history.current.pop();
        if (previous) {
            restore.current = previous;
            setQuery(previous.query);
            setLevel(previous.level);
        }
    }

    const reset = useCallback(() => {
        history.current = [];
        restore.current = null;
        setQuery('');
        setLevel('root');
    }, []);

    useLayoutEffect(() => {
        const view = restore.current;
        if (!view) {
            return;
        }

        restore.current = null;
        const results = panel.current?.querySelector('[data-command-results]');
        if (results) {
            results.scrollTop = view.scroll;
        }

        const options = panel.current?.querySelectorAll<HTMLElement>(
            '[data-command-item]',
        );
        const target = Array.from(options ?? []).find(
            (item) =>
                (item.getAttribute('aria-label') ?? item.textContent) ===
                view.focus,
        );
        const fallback = panel.current?.querySelector<HTMLElement>(
            'input, [data-command-item]',
        );

        (target ?? fallback)?.focus({ preventScroll: true });
    }, [level, panel]);

    return {
        level,
        query,
        setQuery,
        enter,
        back,
        reset,
        restoringFocus: Boolean(restore.current?.focus),
    };
}
