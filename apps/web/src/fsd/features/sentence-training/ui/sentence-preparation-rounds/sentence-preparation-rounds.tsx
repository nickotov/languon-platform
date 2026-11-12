'use client';
import styles from '../styles/sentence-preparation-rounds-common.module.css';
import { useState } from 'react';
import { Button } from '@/fsd/shared/ui';
import { PreparationRound } from './ui/preparation-round/preparation-round';
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
                {shown.map((round, index) => (
                    <PreparationRound
                        key={round.id}
                        round={round}
                        index={index}
                        startDisabled={startDisabled}
                        onStartRound={onStartRound}
                    />
                ))}
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
