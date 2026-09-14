'use client';

import { ChevronRightIcon, HomeIcon, MoreHorizontalIcon } from 'lucide-react';
import { useState, type MouseEvent } from 'react';
import styles from './breadcrumb.module.css';

export type BreadcrumbItem = {
    label: string;
    href?: string;
    onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
};
export type BreadcrumbProps = {
    items: BreadcrumbItem[];
    showHomeIcon?: boolean;
    maxVisibleItems?: number;
    ariaLabel?: string;
    className?: string;
};

export function Breadcrumb({
    items,
    showHomeIcon = false,
    maxVisibleItems = 4,
    ariaLabel = 'Breadcrumb',
    className,
}: BreadcrumbProps) {
    const [expanded, setExpanded] = useState(false);
    if (!items.length) return null;
    const collapse =
        !expanded && maxVisibleItems > 2 && items.length > maxVisibleItems;
    const entries: Array<{ item?: BreadcrumbItem; index?: number }> = collapse
        ? [
              { item: items[0]!, index: 0 },
              {},
              ...items.slice(-(maxVisibleItems - 2)).map((item, i) => ({
                  item,
                  index: items.length - (maxVisibleItems - 2) + i,
              })),
          ]
        : items.map((item, index) => ({ item, index }));
    return (
        <nav aria-label={ariaLabel} className={className}>
            <ol className={styles.list}>
                {entries.map((entry, position) => (
                    <li
                        className={styles.item}
                        key={
                            entry.item
                                ? `${entry.item.label}-${entry.index}`
                                : 'ellipsis'
                        }
                    >
                        {!entry.item ? (
                            <button
                                type='button'
                                aria-label='Show all breadcrumb levels'
                                onClick={() => setExpanded(true)}
                                className={styles.ellipsis}
                            >
                                <MoreHorizontalIcon aria-hidden='true' />
                            </button>
                        ) : (
                            <>
                                {showHomeIcon && entry.index === 0 ? (
                                    <HomeIcon
                                        className={styles.icon}
                                        aria-hidden='true'
                                    />
                                ) : null}
                                {entry.index === items.length - 1 ||
                                (!entry.item.href && !entry.item.onClick) ? (
                                    <span
                                        aria-current={
                                            entry.index === items.length - 1
                                                ? 'page'
                                                : undefined
                                        }
                                        className={
                                            entry.index === items.length - 1
                                                ? styles.current
                                                : styles.muted
                                        }
                                    >
                                        {entry.item.label}
                                    </span>
                                ) : (
                                    <a
                                        href={entry.item.href ?? '#'}
                                        onClick={entry.item.onClick}
                                    >
                                        {entry.item.label}
                                    </a>
                                )}
                            </>
                        )}
                        {position < entries.length - 1 ? (
                            <ChevronRightIcon
                                className={styles.separator}
                                aria-hidden='true'
                            />
                        ) : null}
                    </li>
                ))}
            </ol>
        </nav>
    );
}
