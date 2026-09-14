import styles from './progress.module.css';

export type ProgressSize = 'lg' | 'md' | 'sm';
export type ProgressTone = 'danger' | 'default' | 'success' | 'warning';
export type ProgressProps = {
    ariaLabel?: string;
    className?: string;
    indeterminate?: boolean;
    label?: string;
    max?: number;
    showValue?: boolean;
    size?: ProgressSize;
    tone?: ProgressTone;
    value: number;
};
export type ProgressBarSize = ProgressSize;
export type ProgressBarTone = ProgressTone;
export type ProgressBarProps = ProgressProps;

export function Progress({
    ariaLabel,
    className,
    indeterminate = false,
    label,
    max = 100,
    showValue = false,
    size = 'md',
    tone = 'default',
    value,
}: ProgressProps) {
    const safeMax = max > 0 ? max : 100;
    const clamped = Math.min(
        Math.max(Number.isFinite(value) ? value : 0, 0),
        safeMax,
    );
    const percent = (clamped / safeMax) * 100;
    return (
        <div className={[styles.root, className].filter(Boolean).join(' ')}>
            {label || showValue ? (
                <div className={styles.header}>
                    {label ? <span>{label}</span> : <span />}
                    {showValue ? (
                        <span className={styles.value}>
                            {indeterminate ? '—' : `${Math.round(percent)}%`}
                        </span>
                    ) : null}
                </div>
            ) : null}
            <div
                aria-label={label ?? ariaLabel ?? 'Progress'}
                aria-valuemax={safeMax}
                aria-valuemin={0}
                aria-valuenow={indeterminate ? undefined : clamped}
                aria-valuetext={
                    indeterminate ? 'Loading' : `${Math.round(percent)}%`
                }
                className={[styles.track, styles[size]].join(' ')}
                role='progressbar'
            >
                <span
                    className={[
                        styles.fill,
                        styles[tone],
                        indeterminate ? styles.indeterminate : undefined,
                    ]
                        .filter(Boolean)
                        .join(' ')}
                    style={indeterminate ? undefined : { width: `${percent}%` }}
                />
            </div>
        </div>
    );
}

export const ProgressBar = Progress;
