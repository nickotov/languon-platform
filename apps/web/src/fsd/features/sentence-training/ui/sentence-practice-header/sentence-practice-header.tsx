import {
    ArrowLeft,
    History,
    Maximize,
    Minimize,
    SlidersHorizontal,
    X,
} from 'lucide-react';
import { Button, IconButton } from '@/fsd/shared/ui';
import { useSentenceCopy } from '../sentence-copy';

type SentencePracticeHeaderProps = {
    title: string;
    subtitle: string;
    innerView: boolean;
    fullscreen: boolean;
    onBack(): void;
    onTogglePresentation(): void;
    onClose(): void;
    onOpenPreferences: (() => void) | undefined;
    onOpenHistory: (() => void) | undefined;
};

export function SentencePracticeHeader({
    title,
    subtitle,
    innerView,
    fullscreen,
    onBack,
    onTogglePresentation,
    onClose,
    onOpenPreferences,
    onOpenHistory,
}: SentencePracticeHeaderProps) {
    const { t } = useSentenceCopy();
    const presentationLabel = t(
        fullscreen ? 'Exit full screen' : 'Enter full screen',
    );
    const presentationIcon = fullscreen ? (
        <Minimize aria-hidden className='h-4 w-4' />
    ) : (
        <Maximize aria-hidden className='h-4 w-4' />
    );
    const iconActionClassName =
        'relative !rounded-full !border !border-border-strong !bg-background-surface !text-text-primary hover:!bg-background-subtle before:absolute before:-inset-2 before:content-[""] focus-visible:!outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background-surface';
    const smallIconActionClassName = `${iconActionClassName} !h-8 !w-8`;
    const presentationClassName = `${smallIconActionClassName} hidden md:inline-flex`;
    const showPreferences = !innerView && !!onOpenPreferences;
    const showHistory = !innerView && !!onOpenHistory;

    return (
        <header className='border-b border-border-default pt-[env(safe-area-inset-top)]'>
            <div className='mx-auto flex w-full max-w-5xl items-center gap-2 px-3 py-2.5 sm:px-6'>
                {innerView ? (
                    <IconButton
                        className={iconActionClassName}
                        variant='outline'
                        size='md'
                        autoFocus
                        icon={
                            <ArrowLeft
                                aria-hidden
                                className='h-[18px] w-[18px] rtl:rotate-180'
                            />
                        }
                        title={t('Back to practice')}
                        label={t('Back to practice')}
                        onClick={onBack}
                    />
                ) : null}
                <div className='min-w-0 flex-1'>
                    <h2 className='truncate text-sm font-semibold text-text-primary sm:text-base'>
                        {title}
                    </h2>
                    <p className='truncate text-xs text-text-secondary'>
                        {subtitle}
                    </p>
                </div>
                <div className='flex shrink-0 items-center gap-1.5 sm:gap-2'>
                    {showPreferences ? (
                        <Button
                            variant='secondary'
                            size='compact'
                            aria-label={t('AI settings')}
                            leadingIcon={
                                <SlidersHorizontal
                                    aria-hidden
                                    className='h-4 w-4'
                                />
                            }
                            onClick={onOpenPreferences}
                        >
                            <span className='hidden md:inline'>
                                {t('AI settings')}
                            </span>
                        </Button>
                    ) : null}
                    {showHistory ? (
                        <IconButton
                            className={smallIconActionClassName}
                            variant='outline'
                            size='sm'
                            icon={<History aria-hidden className='h-4 w-4' />}
                            title={t('History')}
                            label={t('My practice history')}
                            onClick={onOpenHistory}
                        />
                    ) : null}
                    <IconButton
                        className={presentationClassName}
                        variant='outline'
                        size='sm'
                        icon={presentationIcon}
                        title={presentationLabel}
                        label={presentationLabel}
                        onClick={onTogglePresentation}
                    />
                    <Button
                        variant='secondary'
                        size='compact'
                        aria-label={t('Close practice')}
                        leadingIcon={<X aria-hidden className='h-4 w-4' />}
                        onClick={onClose}
                    >
                        <span className='hidden sm:inline'>{t('Close')}</span>
                    </Button>
                </div>
            </div>
        </header>
    );
}
