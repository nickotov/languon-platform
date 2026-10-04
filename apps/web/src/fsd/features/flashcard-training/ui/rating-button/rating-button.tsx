import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import { Spinner } from '@/fsd/shared/ui';
import type { Rating } from '../../types';

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
            return 'flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border-default bg-background-surface px-3 py-2 md:hidden' as const;
        }

        return 'hidden w-24 shrink-0 flex-col items-center justify-center gap-2 self-stretch rounded-2xl px-2 py-6 hover:bg-background-subtle hover:opacity-100 focus-visible:opacity-100 md:flex' as const;
    }

    const display = resolveDisplay();

    const opacity = mobile || loading ? 'opacity-100' : 'opacity-30';

    const classes = `${display} ${opacity} text-text-secondary transition-opacity motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed`;

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
            <span
                className={
                    mobile
                        ? 'flex items-center justify-center'
                        : 'flex h-12 w-12 items-center justify-center rounded-full border border-border-strong bg-background-surface'
                }
            >
                {loading ? (
                    <Spinner />
                ) : (
                    <Icon aria-hidden className='h-5 w-5' />
                )}
            </span>
            <span className='text-center text-sm font-medium'>{label}</span>
        </button>
    );
}
