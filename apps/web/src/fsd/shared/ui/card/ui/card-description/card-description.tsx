import { type HTMLAttributes } from 'react';
import styles from '../../../styles/card-common.module.css';

export function CardDescription({
    className,
    ...props
}: HTMLAttributes<HTMLParagraphElement>) {
    return (
        <p
            {...props}
            className={[styles.description, className]
                .filter(Boolean)
                .join(' ')}
        />
    );
}
