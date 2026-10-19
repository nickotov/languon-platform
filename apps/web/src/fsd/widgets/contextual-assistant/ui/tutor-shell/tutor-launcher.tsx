'use client';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import { TutorMark } from './tutor-header';
import { tutorShellCopy } from './shell-copy';
import styles from './tutor-shell.module.css';

/** A dormant launcher. Conversation queries begin only after the first open. */
export function TutorLauncher({ onOpen }: { onOpen(): void }) {
    const { locale } = useI18n();
    const copy = tutorShellCopy(locale);
    return (
        <div className={styles.area}>
            <button
                type='button'
                className={styles.pill}
                onClick={onOpen}
                aria-label={`${copy.open} — ${copy.title}`}
            >
                <span className={styles.pillMark}>
                    <TutorMark />
                </span>
                <span>{copy.title}</span>
                <ChevronDown className={styles.desktopChevron} aria-hidden />
                <ChevronUp className={styles.mobileChevron} aria-hidden />
            </button>
        </div>
    );
}
