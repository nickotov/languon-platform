'use client';

import { useState, type ReactNode } from 'react';
import { ListChecks } from 'lucide-react';
import type { ExerciseLearningBlock } from '@languon/contracts';
import { Button } from '@/fsd/shared/ui/button/button';
import type {
    LearningBlockLabels,
    LearningBlockVariant,
    LearningBlockViewProps,
} from '../../types';
import { LearningBlockView } from '../learning-block-view/learning-block-view';
import { exercisePracticeIdentity } from '../../lib/exercise-practice-identity';
import styles from './learning-exercise-set.module.css';

export interface LearningExerciseEntry {
    block: ExerciseLearningBlock;
    options?:
        Omit<Partial<LearningBlockViewProps>, 'block' | 'labels'> | undefined;
    key?: string | undefined;
}
interface SetProps {
    entries: LearningExerciseEntry[];
    labels: LearningBlockLabels;
    title?: string | undefined;
    variant?: LearningBlockVariant | undefined;
    accented?: boolean | undefined;
    hideHeading?: boolean | undefined;
    scope?: string | undefined;
    headingActions?: ReactNode;
    headingLeading?: ReactNode;
}

/** A visual collection only: each question retains its own identity and private history. */
export function LearningExerciseSet({
    entries,
    labels,
    title,
    variant = 'learner',
    accented = true,
    hideHeading,
    scope,
    headingActions,
    headingLeading,
}: SetProps) {
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [command, setCommand] = useState({ open: false, at: 0 });
    const [localAttempts, setLocalAttempts] = useState<
        Record<string, { identity: string; attempted: boolean }>
    >({});
    const allExpanded = entries.every((entry) => expanded[entry.block.id]);
    const attempted = entries.filter(
        (entry) =>
            entry.options?.learnerState?.attempted ||
            (localAttempts[entry.block.id]?.attempted &&
                localAttempts[entry.block.id]?.identity ===
                    exercisePracticeIdentity(
                        entry.block,
                        entry.options?.exerciseRevision,
                    )),
    ).length;
    const preview = variant === 'compact' || variant === 'review';
    function toggleAll() {
        const open = !allExpanded;
        setExpanded(
            Object.fromEntries(entries.map((entry) => [entry.block.id, open])),
        );
        setCommand((previous) => ({ open, at: previous.at + 1 }));
    }
    function changeExpansion(id: string, open: boolean) {
        setExpanded((previous) => ({ ...previous, [id]: open }));
    }
    function changeAttempted(id: string, attempted: boolean, identity: string) {
        setLocalAttempts((previous) => {
            if (
                previous[id]?.attempted === attempted &&
                previous[id]?.identity === identity
            )
                return previous;
            return { ...previous, [id]: { attempted, identity } };
        });
    }
    const className = [
        styles.root,
        accented && !preview ? styles.accented : undefined,
        preview ? styles.preview : undefined,
    ]
        .filter(Boolean)
        .join(' ');
    const label = title ?? labels.kinds.exercise;
    const toggleLabel = allExpanded
        ? (labels.collapseAll ?? labels.collapse ?? labels.hideAnswer)
        : (labels.expandAll ?? labels.expand ?? labels.showAnswer);
    const summary = `${attempted} / ${entries.length}${labels.attempted ? ` ${labels.attempted}` : ''}`;
    const shown = variant === 'compact' ? entries.slice(0, 2) : entries;
    const more = entries.length - shown.length;
    return (
        <section
            className={className}
            data-block-family='exercise'
            aria-label={label}
        >
            {!hideHeading ? (
                <header className={styles.heading}>
                    {headingLeading}
                    <ListChecks size={16} aria-hidden='true' />
                    <h3>{label}</h3>
                    <span className={styles.metadata}>
                        {labels.kinds.exercise} · {entries.length}
                    </span>
                    <span className={styles.spacer} />
                    {headingActions}
                </header>
            ) : null}
            {!preview ? (
                <div className={styles.summary}>
                    <span>{summary}</span>
                    <span className={styles.spacer} />
                    <Button size='compact' variant='ghost' onClick={toggleAll}>
                        {toggleLabel}
                    </Button>
                </div>
            ) : null}
            <div className={styles.items}>
                {shown.map((entry, index) => (
                    <ExerciseSetItem
                        key={entry.key ?? entry.block.id}
                        entry={entry}
                        index={index}
                        command={command}
                        variant={variant}
                        labels={labels}
                        scope={scope}
                        onExpansion={changeExpansion}
                        onAttempted={changeAttempted}
                    />
                ))}
            </div>
            {more ? <p className={styles.metadata}>+ {more}</p> : null}
        </section>
    );
}

function ExerciseSetItem({
    entry,
    index,
    command,
    variant,
    labels,
    scope,
    onExpansion,
    onAttempted,
}: {
    entry: LearningExerciseEntry;
    index: number;
    command: { open: boolean; at: number };
    variant: LearningBlockVariant;
    labels: LearningBlockLabels;
    scope?: string | undefined;
    onExpansion: (id: string, open: boolean) => void;
    onAttempted: (id: string, attempted: boolean, identity: string) => void;
}) {
    function change(open: boolean) {
        onExpansion(entry.block.id, open);
        entry.options?.onExpansionChange?.(open);
    }
    function attempt(id: string, attempted: boolean) {
        onAttempted(
            id,
            attempted,
            exercisePracticeIdentity(
                entry.block,
                entry.options?.exerciseRevision,
            ),
        );
        entry.options?.onAttemptedChange?.(id, attempted);
    }
    return (
        <LearningBlockView
            {...entry.options}
            block={entry.block}
            labels={labels}
            scope={scope}
            variant={variant}
            hideHeading
            accented={false}
            exerciseIndex={index + 1}
            expandAll={command}
            onExpansionChange={change}
            onAttemptedChange={attempt}
        />
    );
}
