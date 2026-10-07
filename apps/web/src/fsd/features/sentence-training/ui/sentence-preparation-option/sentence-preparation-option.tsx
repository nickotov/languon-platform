'use client';
import { CoinsIcon, LayersIcon, PauseIcon, PlayIcon } from 'lucide-react';
import { Button, InlineAlert, Switch } from '@/fsd/shared/ui';
import type { Configuration, SentencePreparationController } from '../../types';
import { usePreparationRetryCooldown } from '../../hooks/use-preparation-retry-cooldown';
import { usePreparationCopy } from '../sentence-preparation-copy';

export function SentencePreparationOption({
    enabled,
    onChange,
    roundWords,
    totalWords,
    mode,
    controller,
    onView,
}: {
    enabled: boolean;
    onChange(value: boolean): void;
    roundWords: number;
    totalWords: number | null;
    mode: Configuration['mode'];
    controller: SentencePreparationController;
    onView(): void;
}) {
    const { P, num } = usePreparationCopy();
    const run = controller.preparation;
    const cooldown = usePreparationRetryCooldown(controller.error?.retryAt);
    const existing =
        run &&
        run.state !== 'completed' &&
        run.state !== 'failed' &&
        run.pauseReason !== 'stale' &&
        run.pauseReason !== 'access';
    const sizes = [roundWords];
    let remaining = Math.max(0, (totalWords ?? roundWords) - roundWords);
    while (remaining > 0) {
        sizes.push(Math.min(100, remaining));
        remaining -= 100;
    }
    const noteKeys = {
        'saved-first': 'modeSavedFirst',
        'new-only': 'modeNew',
        'review-only': 'modeReview',
    } as const;
    const roundPlan = P('roundPlan', {
        list: totalWords === null ? '…' : sizes.map(num).join(' → '),
    });
    const coverage = P('readyWords', {
        done: run?.preparedCount ?? 0,
        total: run?.eligibleCount ?? totalWords ?? 0,
    });
    const resumable = run?.state === 'paused';
    const stoppable =
        run?.state === 'running' ||
        run?.state === 'queued' ||
        run?.state === 'stopping';
    const stopping = run?.state === 'stopping';
    function handleStop() {
        void controller.stop();
    }
    function handleResume() {
        void controller.resume();
    }
    const actions = (
        <div className='flex flex-wrap gap-2'>
            <Button size='compact' onClick={onView}>
                {P('viewProgress')}
            </Button>
            {resumable ? (
                <Button
                    size='compact'
                    variant='secondary'
                    leadingIcon={<PlayIcon aria-hidden className='h-4 w-4' />}
                    onClick={handleResume}
                    disabled={controller.busy || cooldown}
                >
                    {P('resume')}
                </Button>
            ) : null}
            {stoppable ? (
                <Button
                    size='compact'
                    variant='secondary'
                    leadingIcon={<PauseIcon aria-hidden className='h-4 w-4' />}
                    disabled={stopping || controller.busy}
                    onClick={handleStop}
                >
                    {P('stop')}
                </Button>
            ) : null}
        </div>
    );
    if (existing)
        return (
            <InlineAlert
                tone='info'
                title={P('existingTitle')}
                actions={actions}
            >
                {P('existingBody')} {coverage}
            </InlineAlert>
        );
    return (
        <div className='space-y-3'>
            <Switch
                label={P('switchLabel')}
                description={P('switchDesc')}
                checked={enabled}
                onCheckedChange={onChange}
            />
            {enabled ? (
                <div className='space-y-3 rounded-xl border border-border-default bg-background-subtle p-3'>
                    <div className='grid gap-2 sm:grid-cols-2'>
                        <div className='rounded-lg border border-border-default bg-background-surface px-3 py-2 text-sm font-semibold text-text-primary'>
                            {P('roundScope', { n: roundWords })}
                        </div>
                        <div className='rounded-lg border border-primary-default bg-primary-subtle px-3 py-2 text-sm font-semibold text-text-primary'>
                            {P('prepScope', { n: totalWords ?? '…' })}
                        </div>
                    </div>
                    <p className='text-xs text-text-secondary'>
                        {P('roundVsPrep')}
                    </p>
                    <p className='flex items-start gap-2 text-xs text-text-primary'>
                        <LayersIcon
                            aria-hidden
                            className='mt-0.5 h-3.5 w-3.5 shrink-0 text-text-secondary'
                        />
                        {roundPlan}
                    </p>
                    <p className='flex items-start gap-2 text-xs text-text-primary'>
                        <CoinsIcon
                            aria-hidden
                            className='mt-0.5 h-3.5 w-3.5 shrink-0 text-text-secondary'
                        />
                        <span>
                            {P(noteKeys[mode])} {P('noEstimate')}
                        </span>
                    </p>
                    <p className='text-xs text-text-secondary'>
                        {P('startWhenReady')}
                    </p>
                </div>
            ) : null}
        </div>
    );
}
