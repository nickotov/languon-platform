import { type HTMLAttributes } from 'react';
import styles from '../../../styles/card-common.module.css';

export function CardTitle({
    className,
    ...props
}: HTMLAttributes<HTMLHeadingElement>) {
    return (
        <h3
            {...props}
            className={[styles.title, className].filter(Boolean).join(' ')}
        />
    );
}
