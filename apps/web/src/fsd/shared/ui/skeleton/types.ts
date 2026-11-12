import type { HTMLAttributes } from 'react';

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

export type SkeletonCardProps = { className?: string; lines?: number };
