import type { CSSProperties } from 'react';
import styles from '../styles/skeleton-common.module.css';
import type { SkeletonProps } from './types';

export function Skeleton({
    animation = 'pulse',
    className,
    height,
    lastLineWidth = '60%',
    lines = 1,
    style,
    variant = 'text',
    width,
    ...props
}: SkeletonProps) {
    const blockStyle = (
        blockWidth: number | string | undefined,
    ): CSSProperties => ({
        height,
        width: blockWidth,
        ...style,
    });

    if (variant === 'text' && lines > 1) {
        return (
            <div
                {...props}
                aria-busy='true'
                aria-live='polite'
                className={[styles.lines, className].filter(Boolean).join(' ')}
                role='status'
                style={{ width }}
            >
                {Array.from({ length: lines }, (_, index) => (
                    <span
                        className={[
                            styles.skeleton,
                            styles.text,
                            styles[animation],
                        ].join(' ')}
                        key={index}
                        style={blockStyle(
                            index === lines - 1 ? lastLineWidth : '100%',
                        )}
                    />
                ))}
                <span className={styles.srOnly}>Loading…</span>
            </div>
        );
    }

    return (
        <div
            {...props}
            aria-busy='true'
            aria-live='polite'
            className={[
                styles.skeleton,
                styles[variant],
                styles[animation],
                className,
            ]
                .filter(Boolean)
                .join(' ')}
            role='status'
            style={blockStyle(width)}
        >
            <span className={styles.srOnly}>Loading…</span>
        </div>
    );
}
