'use client';
import {
    type KeyboardEvent,
    type ReactNode,
    useId,
    useRef,
    useState,
} from 'react';
import styles from './tabs.module.css';
export function Tabs({
    label,
    items,
}: {
    label: string;
    items: { content: ReactNode; label: string }[];
}) {
    const [active, setActive] = useState(0);
    const rootId = useId();
    const tabs = useRef<Array<HTMLButtonElement | null>>([]);
    function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
        const next =
            event.key === 'ArrowRight'
                ? (index + 1) % items.length
                : event.key === 'ArrowLeft'
                  ? (index - 1 + items.length) % items.length
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? items.length - 1
                      : null;
        if (next === null) return;
        event.preventDefault();
        setActive(next);
        tabs.current[next]?.focus();
    }
    return (
        <div>
            <div aria-label={label} className={styles.list} role='tablist'>
                {items.map((item, index) => (
                    <button
                        aria-controls={`${rootId}-panel-${index}`}
                        aria-selected={active === index}
                        id={`${rootId}-tab-${index}`}
                        key={item.label}
                        onClick={() => setActive(index)}
                        onKeyDown={(event) => moveFocus(event, index)}
                        ref={(node) => {
                            tabs.current[index] = node;
                        }}
                        role='tab'
                        tabIndex={active === index ? 0 : -1}
                        type='button'
                    >
                        {item.label}
                    </button>
                ))}
            </div>
            <div
                aria-labelledby={`${rootId}-tab-${active}`}
                className={styles.panel}
                id={`${rootId}-panel-${active}`}
                role='tabpanel'
            >
                {items[active]?.content}
            </div>
        </div>
    );
}
