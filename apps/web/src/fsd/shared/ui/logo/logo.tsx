import Link from 'next/link';
import type { ReactNode } from 'react';

import styles from './logo.module.css';

type LogoProps = {
    className?: string | undefined;
    wordmarkClassName?: string | undefined;
    href?: string;
    label?: string;
    monogram?: boolean;
    suffix?: ReactNode;
};

export function Logo({
    className,
    wordmarkClassName,
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
            {monogram ? null : (
                <span
                    className={[styles.wordmark, wordmarkClassName]
                        .filter(Boolean)
                        .join(' ')}
                >
                    Languon
                </span>
            )}
            {suffix}
        </>
    );

    const classes = [styles.logo, className].filter(Boolean).join(' ');

    if (href) {
        return (
            <Link aria-label={label} className={classes} href={href}>
                {content}
            </Link>
        );
    }

    return (
        <span aria-label={label} className={classes} role='img'>
            {content}
        </span>
    );
}
