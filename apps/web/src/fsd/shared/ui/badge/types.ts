import type { HTMLAttributes, ReactNode } from 'react';

export type BadgeTone = 'danger' | 'info' | 'neutral' | 'success' | 'warning';

export type BadgeSize = 'md' | 'sm';

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
    children: ReactNode;
    icon?: ReactNode;
    size?: BadgeSize;
    tone?: BadgeTone;
    withDot?: boolean;
};
