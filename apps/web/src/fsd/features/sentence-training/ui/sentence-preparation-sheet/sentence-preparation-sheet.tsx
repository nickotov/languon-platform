'use client';
import styles from './sentence-preparation-sheet.module.css';
import { PauseIcon, PlayIcon } from 'lucide-react';
import type { SentencePreparationBatch } from '@languon/contracts';
import { Button, Dialog } from '@/fsd/shared/ui';
import type { Configuration, SentencePreparationController } from '../../types';
import { usePreparationRetryCooldown } from '../../hooks/use-preparation-retry-cooldown';
import { useCompactPresentation } from '../use-compact-presentation';
import { usePreparationCopy } from '../sentence-preparation-copy';
import { SentencePreparationProgress } from '../sentence-preparation-progress/sentence-preparation-progress';

export function SentencePreparationSheet({
    controller,
    open,
    onClose,
    onRestartSetup,
    onStart,
    dictionaryTitle,
    sourceLanguage,
    targetLanguage,
    onOpenLibrary,
    onOpenAiSettings,
}: {
    controller: SentencePreparationController;
    open: boolean;
    onClose(): void;
    onRestartSetup(): void;
    onStart(configuration: Configuration): void;
    dictionaryTitle?: string;
    sourceLanguage: string;
    targetLanguage: string;
    onOpenLibrary?: (() => void) | undefined;
    onOpenAiSettings?: (() => void) | undefined;
}) {
    const { P } = usePreparationCopy();
    const compact = useCompactPresentation();
    const cooldown = usePreparationRetryCooldown(controller.error?.retryAt);
    const run = controller.preparation;
    const running = run?.state === 'running' || run?.state === 'queued';
    const stopping = run?.state === 'stopping';
    const resumable =
        (run?.state === 'paused' || run?.state === 'failed') &&
        run.pauseReason !== 'stale' &&
        run.pauseReason !== 'access';
    const working = running || stopping || (!run && controller.busy);
    function stop() {
        void controller.stop();
    }
    function resume() {
        void controller.resume();
    }
    function startAgain() {
        if (!run) {
            controller.clear();
            onRestartSetup();
            return;
        }
        void controller.start({
            direction: run.direction,
            mode: 'saved-first',
            scope: { type: 'all' },
            ...(controller.explanationLanguage
                ? { explanationLanguage: controller.explanationLanguage }
                : {}),
        });
    }
    function startRound(batch: SentencePreparationBatch) {
        if (
            !run ||
            !batch.preparedEntryIds.length ||
            run.pauseReason === 'stale' ||
            run.pauseReason === 'access'
        )
            return;
        onStart({
            direction: run.direction,
            mode: run.mode,
            scope: { type: 'manual', entryIds: batch.preparedEntryIds },
            preparedBatchId: batch.id,
            ...(controller.explanationLanguage
                ? { explanationLanguage: controller.explanationLanguage }
                : {}),
        });
    }
    const footer = (
        <div className={styles.footer}>
            {working ? (
                <p className={styles.footerNote}>{P('backgroundNote')}</p>
            ) : null}
            <div className={styles.actions}>
                {running || stopping ? (
                    <Button
                        variant='secondary'
                        leadingIcon={
                            <PauseIcon aria-hidden className={styles.icon} />
                        }
                        loading={stopping}
                        disabled={stopping || controller.busy}
                        onClick={stop}
                    >
                        {P('stop')}
                    </Button>
                ) : null}
                {resumable ? (
                    <Button
                        variant='secondary'
                        leadingIcon={
                            <PlayIcon aria-hidden className={styles.icon} />
                        }
                        disabled={controller.busy || cooldown}
                        onClick={resume}
                    >
                        {P('resume')}
                    </Button>
                ) : null}
                <Button
                    variant={working ? 'primary' : 'secondary'}
                    onClick={onClose}
                >
                    {working ? P('background') : P('close')}
                </Button>
            </div>
        </div>
    );
    return (
        <Dialog
            open={open}
            onClose={onClose}
            variant={compact ? 'sheet' : 'dialog'}
            className={compact ? styles.compactDialog : ''}
            size='md'
            title={P('title')}
            description={dictionaryTitle}
            footer={footer}
        >
            <SentencePreparationProgress
                controller={controller}
                sourceLanguage={sourceLanguage}
                targetLanguage={targetLanguage}
                onStartRound={startRound}
                onStartAgain={startAgain}
                onOpenLibrary={onOpenLibrary}
                onOpenAiSettings={onOpenAiSettings}
            />
        </Dialog>
    );
}
