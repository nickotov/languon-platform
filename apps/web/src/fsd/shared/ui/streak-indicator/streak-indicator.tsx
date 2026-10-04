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
                <span className={styles.skeleton} />
                <span className={styles.skeleton} />
            </span>
        );

    const has = count > 0;

    const label = has
        ? `${count} day${count === 1 ? '' : 's'}`
        : 'No streak yet';

    function resolveSr() {
        if (has) {
            return `Current study streak: ${label}${activeToday ? '' : ', not yet studied today'}`;
        }

        return 'No study streak yet' as const;
    }

    const sr = resolveSr();

    function resolveClassName() {
        if (!has) {
            return styles.empty;
        }

        if (activeToday) {
            return styles.hot;
        }

        return styles.pending;
    }

    const resolvedClassName = resolveClassName();

    const value = (
        <span
            className={[styles.value, styles[size], resolvedClassName].join(
                ' ',
            )}
        >
            {has ? (
                <FlameIcon className={styles.valueIcon} aria-hidden='true' />
            ) : (
                <MinusIcon className={styles.valueIcon} aria-hidden='true' />
            )}
            <span className={styles.valueLabel}>{label}</span>
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
                    <h3 className={styles.title}>Study streak</h3>
                    <span className={styles.sr}>{sr}</span>
                    <span aria-hidden='true'>{value}</span>
                </div>
                {week ? <WeekTrack week={week} showLabels /> : null}
            </div>
            {description ? (
                <p className={styles.description}>{description}</p>
            ) : null}
        </section>
    );
}
