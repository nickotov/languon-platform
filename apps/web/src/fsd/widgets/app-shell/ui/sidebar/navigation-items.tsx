import Link from 'next/link';

import { Skeleton } from '@/fsd/shared/ui';

import styles from './sidebar.module.css';

export function NavigationLink({
    active,
    description,
    href,
    icon,
    label,
    onNavigate,
}: {
    active: boolean;
    description?: string;
    href: string;
    icon?: React.ReactNode;
    label: string;
    onNavigate?: (() => void) | undefined;
}) {
    return (
        <Link
            aria-current={active ? 'page' : undefined}
            className={active ? styles.navLinkActive : styles.navLink}
            href={href}
            {...(onNavigate ? { onClick: onNavigate } : {})}
            title={label}
        >
            {active ? (
                <span aria-hidden className={styles.activeMarker} />
            ) : null}
            {icon}
            <span className={styles.navCopy}>
                <strong className={styles.navTitle}>{label}</strong>
                {description ? (
                    <span className={styles.navDescription}>{description}</span>
                ) : null}
            </span>
        </Link>
    );
}

export function NavigationLoading({ label }: { label: string }) {
    return (
        <li aria-label={label} aria-live='polite' className={styles.loading}>
            {[72, 58, 80].map((width) => (
                <span aria-hidden className={styles.loadingItem} key={width}>
                    <Skeleton height={10} width={`${width}%`} />
                    <Skeleton height={8} width={`${width - 24}%`} />
                </span>
            ))}
        </li>
    );
}
