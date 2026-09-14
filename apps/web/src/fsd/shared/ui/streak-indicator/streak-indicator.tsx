import { FlameIcon, MinusIcon } from 'lucide-react';
import styles from './streak-indicator.module.css';
export type StreakIndicatorVariant = 'inline' | 'pill' | 'card';
export type StreakIndicatorSize = 'sm' | 'md';
export interface StreakIndicatorProps {
    count: number;
    week?: boolean[];
    variant?: StreakIndicatorVariant;
    size?: StreakIndicatorSize;
    activeToday?: boolean;
    description?: string;
    loading?: boolean;
    className?: string;
}
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
function WeekTrack({
    week,
    showLabels = false,
}: {
    week: boolean[];
    showLabels?: boolean;
}) {
    return (
        <span className={styles.week} aria-hidden='true'>
            {week.slice(-7).map((done, index) => (
                <span key={index} className={styles.day}>
                    <span className={done ? styles.done : styles.dot} />
                    {showLabels ? (
                        <span className={styles.dayLabel}>{DAYS[index]}</span>
                    ) : null}
                </span>
            ))}
        </span>
    );
}
export function StreakIndicator({
    count,
    week,
    variant = 'pill',
    size = 'md',
    activeToday = true,
    description,
    loading = false,
    className,
}: StreakIndicatorProps) {
    if (loading)
        return (
            <span
                className={[styles.loading, className]
                    .filter(Boolean)
                    .join(' ')}
                role='status'
                aria-label='Loading streak'
            >
                <span />
                <span />
            </span>
        );
    const has = count > 0;
    const label = has
        ? `${count} day${count === 1 ? '' : 's'}`
        : 'No streak yet';
    const sr = has
        ? `Current study streak: ${label}${activeToday ? '' : ', not yet studied today'}`
        : 'No study streak yet';
    const value = (
        <span
            className={[
                styles.value,
                styles[size],
                !has ? styles.empty : activeToday ? styles.hot : styles.pending,
            ].join(' ')}
        >
            {has ? (
                <FlameIcon aria-hidden='true' />
            ) : (
                <MinusIcon aria-hidden='true' />
            )}
            <span>{label}</span>
        </span>
    );
    if (variant === 'inline')
        return (
            <span className={className}>
                <span className={styles.sr}>{sr}</span>
                <span aria-hidden='true'>{value}</span>
            </span>
        );
    if (variant === 'pill')
        return (
            <span
                className={[styles.pill, styles[size], className]
                    .filter(Boolean)
                    .join(' ')}
            >
                <span className={styles.sr}>{sr}</span>
                <span aria-hidden='true'>{value}</span>
                {week ? <WeekTrack week={week} /> : null}
            </span>
        );
    return (
        <section
            aria-label='Study streak'
            className={[styles.card, className].filter(Boolean).join(' ')}
        >
            <div className={styles.cardTop}>
                <div>
                    <h3>Study streak</h3>
                    <span className={styles.sr}>{sr}</span>
                    <span aria-hidden='true'>{value}</span>
                </div>
                {week ? <WeekTrack week={week} showLabels /> : null}
            </div>
            {description ? <p>{description}</p> : null}
        </section>
    );
}
