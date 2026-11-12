import styles from '../../../styles/card-common.module.css';
import type { CardSectionProps } from '../../types';

export function CardFooter({ className, ...props }: CardSectionProps) {
    return (
        <div
            {...props}
            className={[styles.footer, className].filter(Boolean).join(' ')}
        />
    );
}
