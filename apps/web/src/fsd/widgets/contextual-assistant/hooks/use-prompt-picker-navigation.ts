import { useLayoutEffect, useRef, useState, type UIEvent } from 'react';

export type PromptPickerGroup = 'root' | 'exercises' | 'blocks' | 'texts';
type Group = PromptPickerGroup;

/** Keep each submenu's search and return position while browsing one surface. */
export function usePromptPickerNavigation() {
    const rootRef = useRef<HTMLDivElement>(null);
    const positions = useRef<Partial<Record<Group, number>>>({});
    const returnFocus = useRef<Partial<Record<Group, string>>>({});
    const [group, setGroup] = useState<Group>('root');
    const [queries, setQueries] = useState<Record<Group, string>>({
        root: '',
        exercises: '',
        blocks: '',
        texts: '',
    });
    const query = queries[group];
    useLayoutEffect(() => {
        const scroll = Array.from(
            rootRef.current?.querySelectorAll<HTMLElement>(
                '[data-command-results]',
            ) ?? [],
        ).find((node) => !node.closest('[hidden]'));

        if (scroll) {
            scroll.scrollTop = positions.current[group] ?? 0;
        }

        const previous = returnFocus.current[group];
        if (previous) {
            const item = Array.from(
                rootRef.current?.querySelectorAll<HTMLElement>(
                    '[data-command-item]',
                ) ?? [],
            ).find(
                (node) =>
                    !node.closest('[hidden]') &&
                    node.getAttribute('aria-label') === previous,
            );

            requestAnimationFrame(() => item?.focus({ preventScroll: true }));
        }
    }, [group]);

    function changeGroup(next: Group) {
        const active = document.activeElement;
        if (
            active instanceof HTMLElement &&
            active.hasAttribute('data-command-item')
        ) {
            returnFocus.current[group] =
                active.getAttribute('aria-label') ?? '';
        }

        setGroup(next);
    }

    function rememberScroll(event: UIEvent<HTMLDivElement>) {
        if (
            event.target instanceof HTMLElement &&
            event.target.hasAttribute('data-command-results')
        ) {
            positions.current[group] = event.target.scrollTop;
        }
    }

    function search(value: string) {
        setQueries((current) => ({ ...current, [group]: value }));
    }

    return { rootRef, group, query, changeGroup, search, rememberScroll };
}
