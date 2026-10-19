import { useEffect, useState } from 'react';
import { useI18n } from '@/fsd/shared/i18n';
import { messagesCopy } from '../../lib/messages-copy';
import styles from './tutor-activity.module.css';

export function TutorActivity({
    active,
    queued,
    text,
    tool,
}: {
    active: boolean;
    queued: boolean;
    text: string;
    tool?: 'reading' | 'preparing' | undefined;
}) {
    const { locale } = useI18n();
    const copy = messagesCopy(locale);
    const [recentText, setRecentText] = useState('');
    useEffect(() => {
        if (!active || !text) return;
        setRecentText(text);
        const timer = setTimeout(() => setRecentText(''), 600);
        return () => clearTimeout(timer);
    }, [active, text]);
    if (!active) return null;
    let state: 'waiting' | 'working' | 'writing' | 'reading' | 'preparing' =
        'working';
    if (queued) state = 'waiting';
    else if (tool) state = tool;
    else if (text && recentText === text) state = 'writing';
    const label = copy[state];
    return (
        <p
            className={styles.activity}
            role='status'
            aria-live='polite'
            aria-atomic='true'
            data-tutor-activity={state}
        >
            <span className={styles.dots} aria-hidden='true'>
                <i />
                <i />
                <i />
            </span>
            <span>{label}</span>
        </p>
    );
}
