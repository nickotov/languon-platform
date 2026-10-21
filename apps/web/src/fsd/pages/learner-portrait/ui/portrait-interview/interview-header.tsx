'use client';
import { useState, type ChangeEvent } from 'react';
import { ArrowLeft, Eye, Pause, ChevronDown } from 'lucide-react';
import { Button, IconButton, Select } from '@/fsd/shared/ui';
import {
    interviewAllTopics,
    interviewCoreTopics,
    interviewText,
    type InterviewLocale,
    type InterviewTopic,
} from '../../lib/interview-copy';
import styles from './portrait-interview.module.css';
export function InterviewHeader({
    locale,
    update,
    completed,
    topic,
    count,
    busy,
    preview,
    onPause,
    onReview,
    onPreview,
    onLocale,
}: {
    locale: InterviewLocale;
    update: boolean;
    completed: InterviewTopic[];
    topic: InterviewTopic;
    count: number;
    busy: boolean;
    preview: boolean;
    onPause(): void;
    onReview(): void;
    onPreview(): void;
    onLocale(locale: InterviewLocale): void;
}) {
    const [expanded, setExpanded] = useState(false);
    function toggle() {
        setExpanded((value) => !value);
    }
    function changeLocale(event: ChangeEvent<HTMLSelectElement>) {
        onLocale(event.target.value as InterviewLocale);
    }
    const topics =
        update || topic === 'hobbies' || topic === 'age'
            ? interviewAllTopics
            : interviewCoreTopics;
    const currentIndex = topics.indexOf(topic);
    const progressLabel =
        currentIndex >= 0
            ? `${interviewText(locale, topic)} · ${currentIndex + 1} ${interviewText(locale, 'of')} ${topics.length}`
            : `${completed.length} ${interviewText(locale, 'of')} ${topics.length} ${interviewText(locale, 'topicsCovered')}`;
    const options = [
        { value: 'en', label: 'English' },
        { value: 'ru', label: 'Русский' },
        { value: 'fr', label: 'Français' },
        { value: 'es', label: 'Español' },
    ];
    return (
        <header className={styles.header}>
            <div className={styles.headerInner}>
                <IconButton
                    icon={<ArrowLeft />}
                    label={interviewText(locale, 'pause')}
                    variant='ghost'
                    onClick={onPause}
                />
                <div className={styles.headerTitle}>
                    <h1>
                        {interviewText(locale, update ? 'update' : 'title')}
                    </h1>
                    <button
                        type='button'
                        className={styles.progressToggle}
                        aria-expanded={expanded}
                        onClick={toggle}
                    >
                        <span className={styles.dots} aria-hidden>
                            {topics.map((value) => {
                                let dotClass = styles.dot;
                                if (completed.includes(value))
                                    dotClass = styles.dotComplete;
                                if (value === topic)
                                    dotClass = styles.dotCurrent;
                                return (
                                    <span key={value} className={dotClass} />
                                );
                            })}
                        </span>
                        <span>{progressLabel}</span>
                        <ChevronDown size={14} />
                    </button>
                </div>
                <div className={styles.desktopLocale}>
                    <Select
                        size='sm'
                        aria-label={interviewText(locale, 'language')}
                        value={locale}
                        options={options}
                        onChange={changeLocale}
                    />
                </div>
                <IconButton
                    icon={<Eye />}
                    label={interviewText(locale, 'preview')}
                    aria-pressed={preview}
                    variant='ghost'
                    onClick={onPreview}
                />
                <IconButton
                    icon={<Pause />}
                    label={interviewText(locale, 'pause')}
                    variant='ghost'
                    onClick={onPause}
                />
                <Button size='compact' variant='ghost' onClick={onReview}>
                    {interviewText(locale, 'review')}{' '}
                    {count > 0 ? (
                        <span className={styles.count}>{count}</span>
                    ) : null}
                </Button>
            </div>
            {expanded ? (
                <div className={styles.topicDetails}>
                    <ol>
                        {topics.map((value) => (
                            <li
                                key={value}
                                aria-current={
                                    value === topic ? 'step' : undefined
                                }
                            >
                                {completed.includes(value) ? '✓ ' : ''}
                                {interviewText(locale, value)}
                            </li>
                        ))}
                    </ol>
                    <p className={styles.meta}>
                        {interviewText(locale, 'optional')}
                    </p>
                    <div className={styles.mobileLocale}>
                        <Select
                            label={interviewText(locale, 'language')}
                            size='sm'
                            value={locale}
                            options={options}
                            onChange={changeLocale}
                            disabled={busy}
                        />
                    </div>
                </div>
            ) : null}
        </header>
    );
}
