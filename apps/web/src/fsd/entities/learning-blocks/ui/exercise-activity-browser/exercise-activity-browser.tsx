'use client';

import { useState, type ChangeEvent } from 'react';
import { Eye } from 'lucide-react';
import {
    exerciseActivityCatalog,
    type ExerciseActivityId,
    type ExerciseActivityMetadata,
} from '@languon/contracts';
import type { Locale } from '@/fsd/shared/i18n';
import { Input } from '@/fsd/shared/ui';
import { exercisePreviewCopy } from '../exercise-activity-preview/preview-copy';
import styles from './exercise-activity-browser.module.css';

function ActivityRow({
    activity,
    locale,
    onChoose,
    onPreview,
}: {
    activity: ExerciseActivityMetadata;
    locale: Locale;
    onChoose(id: ExerciseActivityId): void;
    onPreview(id: ExerciseActivityId): void;
}) {
    const display = activity.locales[locale];
    const previewLabel = `${exercisePreviewCopy(locale).preview}: ${display.name}`;

    function choose() {
        onChoose(activity.id);
    }

    function preview() {
        onPreview(activity.id);
    }

    return (
        <li className={styles.row}>
            <button type='button' className={styles.choose} onClick={choose}>
                <span className={styles.code}>{activity.id}</span>{' '}
                <span>
                    <strong>{display.name}</strong>
                    <span className={styles.description}>
                        {display.description}
                    </span>
                </span>
            </button>
            <button
                type='button'
                className={styles.preview}
                onClick={preview}
                aria-label={previewLabel}
                title={previewLabel}
            >
                <Eye size={16} aria-hidden='true' />
            </button>
        </li>
    );
}

/** Selection and preview are separate commands; the parent owns the next action level. */
export function ExerciseActivityBrowser({
    locale,
    query,
    hideSearch = false,
    onQueryChange,
    onChoose,
    onPreview,
}: {
    locale: Locale;
    query?: string;
    hideSearch?: boolean;
    onQueryChange?(value: string): void;
    onChoose(id: ExerciseActivityId): void;
    onPreview(id: ExerciseActivityId): void;
}) {
    const [localQuery, setLocalQuery] = useState('');
    const value = query ?? localQuery;
    const normalized = value.trim().toLocaleLowerCase(locale);
    const copy = exercisePreviewCopy(locale);
    const activities = exerciseActivityCatalog.filter((activity) => {
        const display = activity.locales[locale];

        return `${activity.id} ${display.name} ${display.description}`
            .toLocaleLowerCase(locale)
            .includes(normalized);
    });
    const categories = ['vocabulary', 'grammar', 'reading', 'writing'] as const;

    function search(event: ChangeEvent<HTMLInputElement>) {
        setLocalQuery(event.target.value);
        onQueryChange?.(event.target.value);
    }

    function renderCategory(
        category: (typeof categories)[number],
        index: number,
    ) {
        const items = activities.filter(
            (activity) => activity.category === category,
        );

        if (!items.length) {
            return null;
        }

        return (
            <section className={styles.group} key={category}>
                <h3>{copy.categories[index]}</h3>
                <ul>
                    {items.map((activity) => (
                        <ActivityRow
                            key={activity.id}
                            activity={activity}
                            locale={locale}
                            onChoose={onChoose}
                            onPreview={onPreview}
                        />
                    ))}
                </ul>
            </section>
        );
    }

    return (
        <div className={styles.root}>
            {!hideSearch && (
                <Input
                    label={copy.search}
                    value={value}
                    onChange={search}
                    type='search'
                />
            )}
            {!activities.length && <p role='status'>{copy.empty}</p>}
            {categories.map(renderCategory)}
        </div>
    );
}
