'use client';

import { useEffect, useRef, type ChangeEvent, type MouseEvent } from 'react';
import type { Locale } from '@/fsd/shared/i18n';
import { Select } from '@/fsd/shared/ui';
import type { GuideActivity } from '../../lib/examples';
import { guideUiCopy } from '../copy';
import styles from './activity-selector.module.css';

const categories = [
    'vocabulary',
    'grammar',
    'reading',
    'writing',
    'listening',
] as const;

export function ActivitySelector({
    locale,
    activities,
    selected,
    onSelect,
}: {
    locale: Locale;
    activities: GuideActivity[];
    selected: string;
    onSelect: (id: string) => void;
}) {
    const containerRef = useRef<HTMLElement>(null);
    const copy = guideUiCopy(locale);
    const groups = categories.map((category, index) => ({
        label: copy.categories[index]!,
        options: activities
            .filter((item) => item.activity.category === category)
            .map((item) => ({
                value: item.activity.id,
                label: `${item.activity.id} · ${item.activity.locales[locale].name}`,
                name: item.activity.locales[locale].name,
            })),
    }));

    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }

        function revealSelectedActivity() {
            if (!container) {
                return;
            }

            const active = container.querySelector<HTMLButtonElement>(
                'button[aria-pressed="true"]',
            );

            if (!active || container.clientHeight === 0) {
                return;
            }

            const bounds = container.getBoundingClientRect();
            const activeBounds = active.getBoundingClientRect();
            // Scroll only the navigator: revealing its selection must not move the lesson.
            if (activeBounds.bottom > bounds.bottom) {
                container.scrollTop += activeBounds.bottom - bounds.bottom;
            } else if (activeBounds.top < bounds.top) {
                container.scrollTop += activeBounds.top - bounds.top;
            }
        }

        revealSelectedActivity();
        if (typeof ResizeObserver === 'undefined') {
            return;
        }

        const observer = new ResizeObserver(revealSelectedActivity);
        observer.observe(container);

        return () => observer.disconnect();
    }, [selected, locale]);

    function handleChange(event: ChangeEvent<HTMLSelectElement>) {
        onSelect(event.target.value);
    }

    function handleActivityClick(event: MouseEvent<HTMLButtonElement>) {
        onSelect(event.currentTarget.value);
    }

    return (
        <aside className={styles.root} ref={containerRef}>
            <div className={styles.dock} data-testid='workbook-activity-dock'>
                <Select
                    label={copy.activity}
                    value={selected}
                    groups={groups}
                    onChange={handleChange}
                    size='lg'
                    fullWidth
                />
            </div>
            <nav
                className={styles.navigation}
                aria-label={copy.activityNavigation}
                data-testid='workbook-activity-navigation'
            >
                <p className={styles.title}>{copy.activityNavigation}</p>
                <p className={styles.subtitle}>{copy.formats}</p>
                {groups.map((group) => (
                    <section className={styles.group} key={group.label}>
                        <h3>{group.label}</h3>
                        <ul className={styles.list}>
                            {group.options.map((option) => (
                                <li key={option.value}>
                                    <button
                                        className={styles.activity}
                                        type='button'
                                        value={option.value}
                                        aria-pressed={option.value === selected}
                                        onClick={handleActivityClick}
                                    >
                                        <span className={styles.code}>
                                            {option.value}
                                        </span>{' '}
                                        <span>{option.name}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}
            </nav>
        </aside>
    );
}
