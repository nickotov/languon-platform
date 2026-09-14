import {
    AlertCircleIcon,
    CalendarClockIcon,
    CheckCircle2Icon,
    ClockIcon,
} from 'lucide-react';
import styles from './review-badge.module.css';
export type ReviewBadgeStatus = 'due' | 'overdue' | 'upcoming' | 'mastered';
export type ReviewBadgeSize = 'sm' | 'md';
export interface ReviewBadgeProps {
    status?: ReviewBadgeStatus;
    label?: string;
    count?: number;
    size?: ReviewBadgeSize;
    hideIcon?: boolean;
    onClick?: () => void;
    className?: string;
}
const data = {
    due: { label: 'Due for review', Icon: ClockIcon },
    overdue: { label: 'Overdue', Icon: AlertCircleIcon },
    upcoming: { label: 'Upcoming', Icon: CalendarClockIcon },
    mastered: { label: 'Mastered', Icon: CheckCircle2Icon },
};
export function ReviewBadge({
    status = 'due',
    label,
    count,
    size = 'md',
    hideIcon = false,
    onClick,
    className,
}: ReviewBadgeProps) {
    const { Icon, label: defaultLabel } = data[status];
    const content = (
        <>
            {!hideIcon ? <Icon aria-hidden='true' /> : null}
            <span>{label ?? defaultLabel}</span>
            {typeof count === 'number' ? (
                <span className={styles.count}>{count}</span>
            ) : null}
        </>
    );
    const cn = [
        styles.root,
        styles[status],
        styles[size],
        onClick ? styles.clickable : '',
        className,
    ]
        .filter(Boolean)
        .join(' ');
    return onClick ? (
        <button type='button' onClick={onClick} className={cn}>
            {content}
        </button>
    ) : (
        <span className={cn}>{content}</span>
    );
}
