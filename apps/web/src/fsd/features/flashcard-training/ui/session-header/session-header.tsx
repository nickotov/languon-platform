import styles from './session-header.module.css';
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

    function resolveModeIcon() {
        if (dialogMode) {
            return <Maximize2 className={styles.icon} />;
        }

        return <Minimize2 className={styles.icon} />;
    }

    const modeIcon = resolveModeIcon();

    const onMode = dialogMode ? onFullscreen : onDialog;

    return (
        <header className={styles.header}>
            <div className={styles.toolbar}>
                <div className={styles.heading}>
                    <h2 className={styles.title}>{title}</h2>
                    <p className={styles.subtitle}>{subtitle}</p>
                </div>
                <div className={styles.actions}>
                    <Button
                        variant='secondary'
                        leadingIcon={modeIcon}
                        onClick={onMode}
                    >
                        {modeLabel}
                    </Button>
                    <Button
                        variant='secondary'
                        leadingIcon={<X className={styles.icon} />}
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
                    className={styles.progress}
                />
            )}
        </header>
    );
}
