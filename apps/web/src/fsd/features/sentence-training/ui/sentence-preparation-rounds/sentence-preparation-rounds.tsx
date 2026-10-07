'use client';
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
        <section aria-labelledby='prep-rounds' className='space-y-2'>
            <h3
                id='prep-rounds'
                className='text-sm font-semibold text-text-primary'
            >
                {P('roundsTitle')}
            </h3>
            <ol className='space-y-2'>
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
                                className='h-3.5 w-3.5'
                            />
                        ) : state === 'partial' ? (
                            <CircleDashedIcon
                                aria-hidden
                                className='h-3.5 w-3.5'
                            />
                        ) : (
                            <Clock3Icon aria-hidden className='h-3.5 w-3.5' />
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
                        <li
                            key={round.id}
                            className='rounded-lg border border-border-default bg-background-surface p-3'
                        >
                            <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
                                <span className='text-sm font-semibold text-text-primary'>
                                    {P('roundN', { i: index + 1 })}
                                </span>
                                <span className='text-sm text-text-secondary'>
                                    {P('roundWords', { n: total })}
                                </span>
                                <span className='text-sm text-text-secondary'>
                                    {P('roundCoverage', { done, total })}
                                </span>
                                <Badge size='sm' tone={tone} icon={icon}>
                                    {label}
                                </Badge>
                            </div>
                            <div className='mt-2 flex flex-wrap items-center gap-2'>
                                <Button
                                    size='compact'
                                    variant={
                                        index === 0 ? 'primary' : 'secondary'
                                    }
                                    leadingIcon={
                                        <PlayIcon
                                            aria-hidden
                                            className='h-4 w-4'
                                        />
                                    }
                                    disabled={!usable}
                                    aria-describedby={reasonId}
                                    onClick={start}
                                >
                                    {P('startReady')}
                                </Button>
                                <p
                                    id={reasonId}
                                    className='text-xs text-text-secondary'
                                >
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
                    className='text-sm font-medium text-primary-default underline underline-offset-2 hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus'
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
