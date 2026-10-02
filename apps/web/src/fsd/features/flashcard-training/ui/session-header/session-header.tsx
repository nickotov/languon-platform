import { Maximize2, Minimize2, X } from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, ProgressBar } from '@/fsd/shared/ui';

export function SessionHeader({
    dictionaryTitle,
    subtitle,
    dialogMode,
    reviewed,
    total,
    showProgress,
    onDialog,
    onFullscreen,
    onEnd,
}: {
    dictionaryTitle: string;
    subtitle: string;
    dialogMode: boolean;
    reviewed: number;
    total: number;
    showProgress: boolean;
    onDialog(): void;
    onFullscreen(): void;
    onEnd(): void;
}) {
    const { t } = useI18n();
    const title = t('training.practiceTitle', { name: dictionaryTitle });
    const modeLabel = t(dialogMode ? 'training.fullscreen' : 'training.dialog');
    const modeIcon = dialogMode ? (
        <Maximize2 className='h-4 w-4' />
    ) : (
        <Minimize2 className='h-4 w-4' />
    );
    const onMode = dialogMode ? onFullscreen : onDialog;
    return (
        <header className='shrink-0 border-b border-border-default bg-background-surface px-4 pb-3 pt-4 md:px-6'>
            <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
                <div className='min-w-0 flex-1 basis-40'>
                    <h2 className='truncate text-base font-semibold text-text-primary'>
                        {title}
                    </h2>
                    <p className='truncate text-sm text-text-secondary'>
                        {subtitle}
                    </p>
                </div>
                <div className='ml-auto flex items-center gap-2'>
                    <Button
                        variant='secondary'
                        leadingIcon={modeIcon}
                        onClick={onMode}
                    >
                        {modeLabel}
                    </Button>
                    <Button
                        variant='secondary'
                        leadingIcon={<X className='h-4 w-4' />}
                        onClick={onEnd}
                    >
                        {t('training.end')}
                    </Button>
                </div>
            </div>
            {showProgress && (
                <ProgressBar
                    value={reviewed}
                    max={Math.max(1, total)}
                    ariaLabel={t('training.reviewedLabel')}
                    size='sm'
                    className='mt-3'
                />
            )}
        </header>
    );
}
