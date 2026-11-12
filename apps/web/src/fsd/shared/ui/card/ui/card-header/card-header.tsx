import styles from '../../../styles/card-common.module.css';
import type { CardSectionProps } from '../../types';

export function CardHeader({ className, ...props }: CardSectionProps) {
    return (
        <div
            {...props}
            className={[styles.header, className].filter(Boolean).join(' ')}
        />
    );
}
