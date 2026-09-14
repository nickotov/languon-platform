import type { CSSProperties, HTMLAttributes } from 'react';

import styles from './skeleton.module.css';

export type SkeletonVariant = 'circle' | 'rect' | 'text';
export type SkeletonAnimation = 'none' | 'pulse' | 'shimmer';
export type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
    animation?: SkeletonAnimation;
    height?: number | string;
    lastLineWidth?: number | string;
    lines?: number;
    variant?: SkeletonVariant;
    width?: number | string;
};

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
    const resolvedHeight =
        height ?? (variant === 'text' ? '0.875rem' : undefined);
    const blockStyle = (
        blockWidth: number | string | undefined,
    ): CSSProperties => ({
        height: resolvedHeight,
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
                style={{ width: width ?? '100%' }}
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
            style={blockStyle(
                width ?? (variant === 'text' ? '100%' : undefined),
            )}
        >
            <span className={styles.srOnly}>Loading…</span>
        </div>
    );
}

export type SkeletonCardProps = { className?: string; lines?: number };

export function SkeletonCard({ className, lines = 3 }: SkeletonCardProps) {
    return (
        <div className={[styles.card, className].filter(Boolean).join(' ')}>
            <div className={styles.cardHeader}>
                <Skeleton
                    animation='shimmer'
                    height={40}
                    variant='circle'
                    width={40}
                />
                <div className={styles.cardHeading}>
                    <Skeleton
                        animation='shimmer'
                        height='0.75rem'
                        width='45%'
                    />
                    <Skeleton
                        animation='shimmer'
                        height='0.625rem'
                        width='30%'
                    />
                </div>
            </div>
            <Skeleton animation='shimmer' lines={lines} />
        </div>
    );
}
