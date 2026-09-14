import Link from 'next/link';
import type { ReactNode } from 'react';

import styles from './logo.module.css';

type LogoProps = {
    className?: string | undefined;
    href?: string;
    label?: string;
    monogram?: boolean;
    suffix?: ReactNode;
};

export function Logo({
    className,
    href,
    label = 'Languon',
    monogram = false,
    suffix,
}: LogoProps) {
    const content = (
        <>
            <span aria-hidden='true' className={styles.mark}>
                L
            </span>
            {monogram ? null : <span className={styles.wordmark}>Languon</span>}
            {suffix}
        </>
    );
    const classes = [styles.logo, className].filter(Boolean).join(' ');

    return href ? (
        <Link aria-label={label} className={classes} href={href}>
            {content}
        </Link>
    ) : (
        <span aria-label={label} className={classes} role='img'>
            {content}
        </span>
    );
}
