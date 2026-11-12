import styles from '../../../styles/card-common.module.css';
import type { CardSectionProps } from '../../types';

export function CardContent({ className, ...props }: CardSectionProps) {
    return (
        <div
            {...props}
            className={[styles.content, className].filter(Boolean).join(' ')}
        />
    );
}
