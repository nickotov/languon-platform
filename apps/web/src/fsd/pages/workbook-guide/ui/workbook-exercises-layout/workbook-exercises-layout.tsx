'use client';

import { useRef, useState, type ReactNode } from 'react';
import type { Locale } from '@/fsd/shared/i18n';
import type { GuideActivity } from '../../lib/examples';
import { ActivitySelector } from '../activity-selector/activity-selector';
import { ExerciseExplorer } from '../exercise-explorer/exercise-explorer';
import styles from './workbook-exercises-layout.module.css';

export function WorkbookExercisesLayout({
    locale,
    activities,
    initialActivity,
    header,
    footer,
}: {
    locale: Locale;
    activities: GuideActivity[];
    initialActivity?: string | undefined;
    header?: ReactNode;
    footer?: ReactNode;
}) {
    const initial =
        activities.find((item) => item.activity.id === initialActivity) ??
        activities.find((item) => item.activity.id === 'V02') ??
        activities[0]!;
    const [selected, setSelected] = useState(initial.activity.id);
    const identityRef = useRef<HTMLElement>(null);
    const current =
        activities.find((item) => item.activity.id === selected) ?? initial;

    function handleSelect(activityId: string) {
        const activity = activities.find(
            (item) => item.activity.id === activityId,
        );

        if (!activity) {
            return;
        }

        setSelected(activity.activity.id);
        const url = new URL(window.location.href);
        url.searchParams.set('activity', activity.activity.id);
        window.history.replaceState(null, '', url);

        const identity = identityRef.current;
        if (identity) {
            const scrollMargin =
                Number.parseFloat(
                    window.getComputedStyle(identity).scrollMarginBlockStart,
                ) || 0;

            if (identity.getBoundingClientRect().top < scrollMargin) {
                identity.scrollIntoView({ block: 'start' });
            }
        }
    }

    return (
        <div className={styles.root}>
            <ActivitySelector
                locale={locale}
                activities={activities}
                selected={selected}
                onSelect={handleSelect}
            />
            <div className={styles.content}>
                {header}
                <ExerciseExplorer
                    key={selected}
                    locale={locale}
                    current={current}
                    identityRef={identityRef}
                />
                {footer}
            </div>
        </div>
    );
}
