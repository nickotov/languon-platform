'use client';
import {
    AlertTriangle,
    Check,
    Loader2,
    RotateCcw,
    Sparkles,
} from 'lucide-react';
import type { KnowledgeBlockFieldTarget } from '@languon/contracts';
import type { BlockFieldAi } from '../../hooks/use-block-field-ai';
import type { BlockAuthoringLabels } from './block-labels';
import styles from './block-field-ai-action.module.css';

export function BlockFieldAiAction({
    ai,
    fieldKey,
    getTarget,
    onAccept,
    labels,
}: {
    ai: BlockFieldAi;
    fieldKey: string;
    getTarget(): KnowledgeBlockFieldTarget | null;
    onAccept(value: string): void;
    labels: BlockAuthoringLabels;
}) {
    const state = ai.states[fieldKey];
    const target = getTarget();
    const stale = Boolean(
        state && JSON.stringify(state.target) !== JSON.stringify(target),
    );
    const label = labels.field(
        target?.currentValue.trim()
            ? 'Check translation'
            : 'Generate translation',
    );
    function run() {
        const next = getTarget();
        if (next) void ai.run(fieldKey, next);
    }
    function dismiss() {
        ai.clear(fieldKey);
    }
    function accept() {
        if (
            !state ||
            JSON.stringify(state.target) !== JSON.stringify(getTarget()) ||
            state.result?.status !== 'suggested'
        )
            return;
        onAccept(state.result.proposedValue);
        dismiss();
    }
    if (!ai.available) return null;
    if (!state)
        return (
            <button
                type='button'
                className={styles.action}
                onClick={run}
                disabled={!target}
            >
                <Sparkles size={14} aria-hidden />
                {label}
            </button>
        );
    if (state.status === 'pending')
        return (
            <p className={styles.status} role='status'>
                <Loader2 size={14} aria-hidden className={styles.spinner} />
                {labels.field('Checking with AI…')}
            </p>
        );
    if (state.status === 'failed')
        return (
            <div className={styles.failed} role='status'>
                <AlertTriangle size={14} aria-hidden />
                <span>
                    {labels.field(
                        state.error ??
                            'AI checking failed. Your edits are kept.',
                    )}
                </span>
                <button
                    type='button'
                    className={styles.action}
                    onClick={run}
                    disabled={!target}
                >
                    <RotateCcw size={12} aria-hidden />
                    {labels.view.retry}
                </button>
            </div>
        );
    if (stale)
        return (
            <div className={styles.stale} role='status'>
                <p>
                    {labels.field(
                        'This field or its source changed. Check again before applying this suggestion.',
                    )}
                </p>
                <button
                    type='button'
                    className={styles.action}
                    onClick={run}
                    disabled={!target}
                >
                    {labels.field('Check again')}
                </button>
                <button
                    type='button'
                    className={styles.action}
                    onClick={dismiss}
                >
                    {labels.field('Dismiss')}
                </button>
            </div>
        );
    const result = state.result;
    if (result?.status === 'correct')
        return (
            <div className={styles.correct} role='status'>
                <Check size={14} aria-hidden />
                <span>
                    {labels.field('Looks correct')} · {result.explanation}
                </span>
                <button
                    type='button'
                    className={styles.action}
                    onClick={dismiss}
                >
                    {labels.field('Dismiss')}
                </button>
            </div>
        );
    if (result?.status !== 'suggested') return null;
    return (
        <div className={styles.suggestion} role='status'>
            {state.target.currentValue && (
                <p className={styles.caption}>
                    {labels.field('Current')}:{' '}
                    <del>{state.target.currentValue}</del>
                </p>
            )}
            <p className={styles.caption}>{labels.field('Suggested')}</p>
            <ins className={styles.proposed}>{result.proposedValue}</ins>
            <p>{result.explanation}</p>
            <div className={styles.actions}>
                <button
                    type='button'
                    className={styles.accept}
                    onClick={accept}
                >
                    <Check size={14} aria-hidden />
                    {labels.field('Accept')}
                </button>
                <button
                    type='button'
                    className={styles.action}
                    onClick={dismiss}
                >
                    {labels.field('Dismiss')}
                </button>
            </div>
        </div>
    );
}
