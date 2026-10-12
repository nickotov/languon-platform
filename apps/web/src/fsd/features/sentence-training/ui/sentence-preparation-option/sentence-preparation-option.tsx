'use client';
import styles from './sentence-preparation-option.module.css';
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
        <div className={styles.actions}>
            <Button size='compact' onClick={onView}>
                {P('viewProgress')}
            </Button>
            {resumable ? (
                <Button
                    size='compact'
                    variant='secondary'
                    leadingIcon={
                        <PlayIcon aria-hidden className={styles.icon} />
                    }
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
                    leadingIcon={
                        <PauseIcon aria-hidden className={styles.icon} />
                    }
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
        <div className={styles.option}>
            <Switch
                label={P('switchLabel')}
                description={P('switchDesc')}
                checked={enabled}
                onCheckedChange={onChange}
            />
            {enabled ? (
                <div className={styles.plan}>
                    <div className={styles.scopes}>
                        <div className={styles.roundScope}>
                            {P('roundScope', { n: roundWords })}
                        </div>
                        <div className={styles.preparationScope}>
                            {P('prepScope', { n: totalWords ?? '…' })}
                        </div>
                    </div>
                    <p className={styles.note}>{P('roundVsPrep')}</p>
                    <p className={styles.planDetail}>
                        <LayersIcon aria-hidden className={styles.detailIcon} />
                        {roundPlan}
                    </p>
                    <p className={styles.planDetail}>
                        <CoinsIcon aria-hidden className={styles.detailIcon} />
                        <span>
                            {P(noteKeys[mode])} {P('noEstimate')}
                        </span>
                    </p>
                    <p className={styles.note}>{P('startWhenReady')}</p>
                </div>
            ) : null}
        </div>
    );
}
