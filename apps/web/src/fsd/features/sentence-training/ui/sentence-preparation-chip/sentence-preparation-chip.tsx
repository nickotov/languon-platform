'use client';
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
    let icon = (
        <AlertTriangleIcon
            aria-hidden
            className='h-4 w-4 text-warning-default'
        />
    );
    let tone = 'border-border-strong bg-background-surface text-text-primary';
    if (controller.uncertain) {
        label = P('uncertainTitle');
    } else if (run?.pauseReason === 'stale' || run?.pauseReason === 'access') {
        label = P('chipExpired');
        icon = <Clock3Icon aria-hidden className='h-4 w-4' />;
    } else if (run?.state === 'queued' || run?.state === 'running' || !run) {
        label = P('chipRunning', vars);
        icon = (
            <Loader2Icon
                aria-hidden
                className='h-4 w-4 animate-spin text-primary-default motion-reduce:animate-none'
            />
        );
    } else if (run.state === 'stopping') {
        label = P('chipStopping');
        icon = (
            <Loader2Icon
                aria-hidden
                className='h-4 w-4 animate-spin motion-reduce:animate-none'
            />
        );
    } else if (run.state === 'completed') {
        label = P('chipDone');
        icon = (
            <CheckCircle2Icon
                aria-hidden
                className='h-4 w-4 text-success-default'
            />
        );
    } else if (run.pauseReason === 'credits') {
        label = P('chipCredits');
        tone = 'border-warning-default bg-warning-subtle text-text-primary';
    } else if (run.state === 'paused' && run.pauseReason === 'user') {
        label = P('chipPaused', vars);
        icon = <PauseIcon aria-hidden className='h-4 w-4' />;
    }
    const className = `inline-flex min-h-[36px] max-w-full items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors hover:bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background-surface ${tone}`;
    return (
        <button
            type='button'
            onClick={onOpen}
            aria-label={`${label}. ${P('viewProgress')}`}
            className={className}
        >
            {icon}
            <span className='truncate'>{label}</span>
        </button>
    );
}
