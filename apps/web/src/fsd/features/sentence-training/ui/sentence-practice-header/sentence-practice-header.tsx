import styles from './sentence-practice-header.module.css';
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
        <Minimize aria-hidden className={styles.icon} />
    ) : (
        <Maximize aria-hidden className={styles.icon} />
    );
    const iconActionClassName = styles.iconAction;
    const smallIconActionClassName = `${iconActionClassName} ${styles.smallIconAction}`;
    const presentationClassName = `${smallIconActionClassName} ${styles.presentationAction}`;
    const showPreferences = !innerView && !!onOpenPreferences;
    const showHistory = !innerView && !!onOpenHistory;

    return (
        <header className={styles.header}>
            <div className={styles.headerContent}>
                {innerView ? (
                    <IconButton
                        className={iconActionClassName}
                        variant='outline'
                        size='md'
                        autoFocus
                        icon={
                            <ArrowLeft
                                aria-hidden
                                className={styles.backIcon}
                            />
                        }
                        title={t('Back to practice')}
                        label={t('Back to practice')}
                        onClick={onBack}
                    />
                ) : null}
                <div className={styles.heading}>
                    <h2 className={styles.title}>{title}</h2>
                    <p className={styles.subtitle}>{subtitle}</p>
                </div>
                <div className={styles.actions}>
                    {showPreferences ? (
                        <Button
                            variant='secondary'
                            size='compact'
                            aria-label={t('AI settings')}
                            leadingIcon={
                                <SlidersHorizontal
                                    aria-hidden
                                    className={styles.icon}
                                />
                            }
                            onClick={onOpenPreferences}
                        >
                            <span className={styles.preferencesLabel}>
                                {t('AI settings')}
                            </span>
                        </Button>
                    ) : null}
                    {showHistory ? (
                        <IconButton
                            className={smallIconActionClassName}
                            variant='outline'
                            size='sm'
                            icon={
                                <History aria-hidden className={styles.icon} />
                            }
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
                        leadingIcon={<X aria-hidden className={styles.icon} />}
                        onClick={onClose}
                    >
                        <span className={styles.closeLabel}>{t('Close')}</span>
                    </Button>
                </div>
            </div>
        </header>
    );
}
