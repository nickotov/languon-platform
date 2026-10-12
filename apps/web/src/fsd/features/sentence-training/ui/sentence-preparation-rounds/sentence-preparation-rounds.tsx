'use client';
import styles from './sentence-preparation-rounds.module.css';
import { useState } from 'react';
import {
    CheckCircle2Icon,
    CircleDashedIcon,
    Clock3Icon,
    PlayIcon,
} from 'lucide-react';
import { Badge, Button } from '@/fsd/shared/ui';
import type { SentencePreparationBatch } from '@languon/contracts';
import type { SentencePreparationController } from '../../types';
import { usePreparationCopy } from '../sentence-preparation-copy';

export function SentencePreparationRounds({
    controller,
    onStartRound,
    startDisabled = false,
}: {
    controller: SentencePreparationController;
    onStartRound(batch: SentencePreparationBatch): void;
    startDisabled?: boolean;
}) {
    const { P } = usePreparationCopy();
    const [expanded, setExpanded] = useState(false);
    const shown = expanded
        ? controller.batches
        : controller.batches.slice(0, 3);
    function toggleExpanded() {
        setExpanded((value) => !value);
    }
    function loadMore() {
        void controller.loadMore();
    }
    return (
        <section aria-labelledby='prep-rounds' className={styles.rounds}>
            <h3 id='prep-rounds' className={styles.title}>
                {P('roundsTitle')}
            </h3>
            <ol className={styles.rounds}>
                {shown.map((round, index) => {
                    const done = round.preparedEntryIds.length;
                    const total = round.entryIds.length;
                    const usable = done > 0 && !startDisabled;
                    const reasonId = `round-${round.id}-reason`;
                    const state = round.state;
                    const label =
                        state === 'ready'
                            ? P('stateReady')
                            : state === 'partial'
                              ? P('statePartial')
                              : P('statePending');
                    const icon =
                        state === 'ready' ? (
                            <CheckCircle2Icon
                                aria-hidden
                                className={styles.icon}
                            />
                        ) : state === 'partial' ? (
                            <CircleDashedIcon
                                aria-hidden
                                className={styles.icon}
                            />
                        ) : (
                            <Clock3Icon aria-hidden className={styles.icon} />
                        );
                    const tone =
                        state === 'ready'
                            ? 'success'
                            : state === 'partial'
                              ? 'info'
                              : 'neutral';
                    function start() {
                        onStartRound(round);
                    }
                    const hint =
                        done === 0
                            ? P('startDisabled')
                            : done < total
                              ? P('startReadyPartial', { done, total })
                              : P('startReadyFull');
                    return (
                        <li key={round.id} className={styles.round}>
                            <div className={styles.roundMetadata}>
                                <span className={styles.title}>
                                    {P('roundN', { i: index + 1 })}
                                </span>
                                <span className={styles.roundTitle}>
                                    {P('roundWords', { n: total })}
                                </span>
                                <span className={styles.roundTitle}>
                                    {P('roundCoverage', { done, total })}
                                </span>
                                <Badge size='sm' tone={tone} icon={icon}>
                                    {label}
                                </Badge>
                            </div>
                            <div className={styles.roundActions}>
                                <Button
                                    size='compact'
                                    variant={
                                        index === 0 ? 'primary' : 'secondary'
                                    }
                                    leadingIcon={
                                        <PlayIcon
                                            aria-hidden
                                            className={styles.icon2}
                                        />
                                    }
                                    disabled={!usable}
                                    aria-describedby={reasonId}
                                    onClick={start}
                                >
                                    {P('startReady')}
                                </Button>
                                <p id={reasonId} className={styles.roundHint}>
                                    {hint}
                                </p>
                            </div>
                        </li>
                    );
                })}
            </ol>
            {controller.batches.length > 3 ? (
                <button
                    type='button'
                    aria-expanded={expanded}
                    onClick={toggleExpanded}
                    className={styles.expandAction}
                >
                    {expanded
                        ? P('hideRounds')
                        : P('showAllRounds', {
                              n:
                                  controller.preparation?.batchCount ??
                                  controller.batches.length,
                          })}
                </button>
            ) : null}
            {expanded && controller.nextOffset !== null ? (
                <Button
                    size='compact'
                    variant='secondary'
                    loading={controller.busy}
                    onClick={loadMore}
                >
                    {P('showAllRounds', {
                        n: controller.preparation?.batchCount ?? 0,
                    })}
                </Button>
            ) : null}
        </section>
    );
}
