import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import { Spinner } from '@/fsd/shared/ui';
import type { Rating } from '../../types';
import styles from './rating-button.module.css';

export function RatingButton({
    rating,
    onRate,
    disabled,
    loading,
    mobile = false,
}: {
    rating: Rating;
    onRate(rating: Rating): void;
    disabled: boolean;
    loading: boolean;
    mobile?: boolean;
}) {
    const { t } = useI18n();

    const Icon = rating === 'again' ? ArrowLeft : ArrowRight;

    const label = t(rating === 'again' ? 'training.again' : 'training.known');

    const shortcut = rating === 'again' ? 'ArrowLeft' : 'ArrowRight';

    function resolveDisplay() {
        if (mobile) {
            return styles.mobile;
        }

        return styles.desktop;
    }

    const display = resolveDisplay();

    const opacity = mobile || loading ? styles.visible : styles.muted;

    const classes = `${styles.button} ${display} ${opacity}`;

    const indicatorClass = mobile
        ? styles.mobileIndicator
        : styles.desktopIndicator;

    function handleClick() {
        onRate(rating);
    }

    return (
        <button
            type='button'
            onClick={handleClick}
            disabled={disabled}
            aria-keyshortcuts={shortcut}
            aria-busy={loading || undefined}
            className={classes}
        >
            <span className={indicatorClass}>
                {loading ? (
                    <Spinner />
                ) : (
                    <Icon aria-hidden className={styles.icon} />
                )}
            </span>
            <span className={styles.label}>{label}</span>
        </button>
    );
}
