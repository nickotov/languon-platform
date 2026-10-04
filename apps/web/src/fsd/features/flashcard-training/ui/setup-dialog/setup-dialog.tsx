import { useId } from 'react';
import { Play } from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Button,
    Dialog,
    DialogActions,
    Radio,
    RadioGroup,
} from '@/fsd/shared/ui';
import { useFlashcardSetup } from '../../hooks/use-flashcard-setup';
import {
    exitTrainingFullscreen,
    requestTrainingFullscreen,
} from '../../hooks/use-training-display';
import type { LearningApi, StartPayload } from '../../types';
import { SetupCardSides } from '../setup-card-sides/setup-card-sides';
import {
    ManualSelection,
    type TrainingLanguage,
} from '../manual-selection/manual-selection';
import { PrepareSummary } from '../prepare-summary/prepare-summary';
import { SetupAlerts } from '../setup-alerts/setup-alerts';

export function SetupDialog({
    open,
    onClose,
    onStart,
    api,
    dictionaryTitle,
    sourceLanguage,
    targetLanguage,
    activeCount,
    signedIn,
}: {
    open: boolean;
    onClose(): void;
    onStart(payload: StartPayload, fullscreen: Promise<boolean>): void;
    api: LearningApi;
    dictionaryTitle: string;
    sourceLanguage: TrainingLanguage;
    targetLanguage: TrainingLanguage;
    activeCount: number;
    signedIn: boolean;
}) {
    const { t } = useI18n();

    const setup = useFlashcardSetup({ open, signedIn, activeCount, api });

    const scopeId = useId();

    const summaryId = useId();

    const scopeDisabled = setup.starting || activeCount === 0;

    const orderValue = setup.shuffle ? 'shuffle' : 'dictionary';

    const description = `${dictionaryTitle} · ${sourceLanguage.name} → ${targetLanguage.name}`;

    const allLabel = t('training.all', { count: activeCount });

    const startLabel = t(
        setup.starting ? 'training.preparing' : 'training.start',
    );

    const remembered = t(signedIn ? 'training.remember' : 'training.signIn');

    let blocked: string | undefined;

    if (!activeCount) blocked = t('training.emptyHelp');
    else if (setup.frontError || setup.backError)
        blocked = t('training.chooseField');
    else if (setup.scopeEmpty) blocked = t('training.selectOne');

    function handleClose() {
        if (!setup.starting) onClose();
    }

    async function handleStart() {
        if (!setup.canStart) return;

        const fullscreen = requestTrainingFullscreen();

        const payload = await setup.start();

        if (!payload) {
            void fullscreen.then((granted) => {
                if (granted) exitTrainingFullscreen();
            });

            return;
        }

        onStart(payload, fullscreen);
    }

    function handleOrder(value: string) {
        setup.setShuffle(value === 'shuffle');
    }

    function handleScope(value: string) {
        setup.setScopeType(value === 'manual' ? 'manual' : 'all');
    }

    const footer = (
        <DialogActions align='between' className='flex-wrap gap-2'>
            <Button
                variant='secondary'
                onClick={handleClose}
                disabled={setup.starting}
            >
                {t('training.cancel')}
            </Button>
            <Button
                onClick={handleStart}
                loading={setup.starting}
                disabled={!setup.canStart}
                leadingIcon={<Play className='h-4 w-4' />}
            >
                {startLabel}
            </Button>
        </DialogActions>
    );

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            title={t('training.title')}
            description={description}
            closeLabel={t('training.close')}
            size='lg'
            dismissible={!setup.starting}
            footer={footer}
            className='bg-background-elevated'
        >
            <div className='flex flex-col gap-6'>
                <SetupAlerts
                    setup={setup}
                    activeCount={activeCount}
                    signedIn={signedIn}
                    onStart={handleStart}
                />
                <SetupCardSides setup={setup} />
                <RadioGroup
                    label={t('training.order')}
                    value={orderValue}
                    onChange={handleOrder}
                    variant='card'
                    orientation='horizontal'
                    disabled={setup.starting}
                >
                    <Radio
                        value='shuffle'
                        description={t('training.shuffleHelp')}
                    >
                        {t('training.shuffle')}
                    </Radio>
                    <Radio
                        value='dictionary'
                        description={t('training.dictionaryOrderHelp')}
                    >
                        {t('training.dictionaryOrder')}
                    </Radio>
                </RadioGroup>
                <section
                    aria-labelledby={scopeId}
                    className='flex flex-col gap-3'
                >
                    <h3
                        id={scopeId}
                        className='text-base font-semibold text-text-primary'
                    >
                        {t('training.entries')}
                    </h3>
                    <RadioGroup
                        value={setup.scopeType}
                        onChange={handleScope}
                        disabled={scopeDisabled}
                        label={t('training.whichEntries')}
                    >
                        <Radio value='all' description={t('training.allHelp')}>
                            {allLabel}
                        </Radio>
                        <Radio
                            value='manual'
                            description={t('training.manualHelp')}
                        >
                            {t('training.manual')}
                        </Radio>
                    </RadioGroup>
                    {setup.scopeType === 'manual' && (
                        <ManualSelection
                            api={api}
                            selectedIds={setup.manualIds}
                            onToggle={setup.toggleManual}
                            onSetMany={setup.setManualMany}
                            onClear={setup.clearManual}
                            sourceLanguage={sourceLanguage}
                            targetLanguage={targetLanguage}
                            disabled={setup.starting}
                        />
                    )}
                    {setup.scopeEmpty && (
                        <p
                            role='alert'
                            className='text-sm font-medium text-danger-default'
                        >
                            {t('training.selectOne')}
                        </p>
                    )}
                </section>
                <section
                    aria-labelledby={summaryId}
                    className='flex flex-col gap-3'
                >
                    <h3
                        id={summaryId}
                        className='text-base font-semibold text-text-primary'
                    >
                        {t('training.ready')}
                    </h3>
                    <PrepareSummary
                        prepare={setup.prepare}
                        onRetry={setup.retryPrepare}
                        blocked={blocked}
                    />
                    <p className='text-sm text-text-tertiary'>{remembered}</p>
                </section>
            </div>
        </Dialog>
    );
}
