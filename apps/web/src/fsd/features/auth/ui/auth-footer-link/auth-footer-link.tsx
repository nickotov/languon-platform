'use client';
import Link from 'next/link';
import { type ReactNode } from 'react';
import styles from '../styles/auth-ui-common.module.css';

export function AuthFooterLink({
    children,
    href,
}: {
    children: ReactNode;
    href: string;
}) {
    return (
        <Link className={styles.footerLink} href={href}>
            {children}
        </Link>
    );
}
