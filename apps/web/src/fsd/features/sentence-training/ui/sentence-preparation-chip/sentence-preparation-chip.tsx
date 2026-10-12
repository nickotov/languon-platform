'use client';
import styles from './sentence-preparation-chip.module.css';
import {
    AlertTriangleIcon,
    CheckCircle2Icon,
    Clock3Icon,
    Loader2Icon,
    PauseIcon,
} from 'lucide-react';
import type { SentencePreparationController } from '../../types';
import { usePreparationCopy } from '../sentence-preparation-copy';

export function SentencePreparationChip({
    controller,
    onOpen,
}: {
    controller: SentencePreparationController;
    onOpen(): void;
}) {
    const { P } = usePreparationCopy();
    const run = controller.preparation;
    if (!run && !controller.uncertain && !controller.busy) return null;
    const vars = {
        done: run?.preparedCount ?? 0,
        total: run?.eligibleCount ?? 0,
    };
    let label = P('chipAttention');
    let icon = <AlertTriangleIcon aria-hidden className={styles.warningIcon} />;
    let tone = styles.neutralTone;
    if (controller.uncertain) {
        label = P('uncertainTitle');
    } else if (run?.pauseReason === 'stale' || run?.pauseReason === 'access') {
        label = P('chipExpired');
        icon = <Clock3Icon aria-hidden className={styles.icon} />;
    } else if (run?.state === 'queued' || run?.state === 'running' || !run) {
        label = P('chipRunning', vars);
        icon = <Loader2Icon aria-hidden className={styles.runningIcon} />;
    } else if (run.state === 'stopping') {
        label = P('chipStopping');
        icon = <Loader2Icon aria-hidden className={styles.stoppingIcon} />;
    } else if (run.state === 'completed') {
        label = P('chipDone');
        icon = <CheckCircle2Icon aria-hidden className={styles.successIcon} />;
    } else if (run.pauseReason === 'credits') {
        label = P('chipCredits');
        tone = styles.warningTone;
    } else if (run.state === 'paused' && run.pauseReason === 'user') {
        label = P('chipPaused', vars);
        icon = <PauseIcon aria-hidden className={styles.icon} />;
    }
    const className = `${styles.chip} ${tone}`;
    return (
        <button
            type='button'
            onClick={onOpen}
            aria-label={`${label}. ${P('viewProgress')}`}
            className={className}
        >
            {icon}
            <span className={styles.label}>{label}</span>
        </button>
    );
}
