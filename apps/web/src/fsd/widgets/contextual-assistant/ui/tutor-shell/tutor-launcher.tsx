'use client';
import { useI18n } from '@/fsd/shared/i18n';
import { Tooltip } from '@/fsd/shared/ui';
import { TutorMark } from './tutor-header';
import { tutorShellCopy } from './shell-copy';
import styles from './tutor-shell.module.css';

/** A dormant launcher. Conversation queries begin only after the first open. */
export function TutorLauncher({ onOpen }: { onOpen(): void }) {
    const { locale } = useI18n();
    const copy = tutorShellCopy(locale);
    return (
        <div className={styles.area}>
            <Tooltip content={copy.launcher} placement='left'>
                <button
                    type='button'
                    className={styles.pill}
                    onClick={onOpen}
                    aria-label={`${copy.open} — ${copy.title}`}
                >
                    <span className={styles.pillMark}>
                        <TutorMark />
                    </span>
                </button>
            </Tooltip>
        </div>
    );
}
