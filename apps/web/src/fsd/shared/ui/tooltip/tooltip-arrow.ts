import type { CSSProperties } from 'react';
import type { Placement } from '@floating-ui/react';

const ARROW_OFFSET = -4;

const oppositeSide = {
    bottom: 'top',
    left: 'right',
    right: 'left',
    top: 'bottom',
} as const;

export function arrowStyle(
    placement: Placement,
    x: number | undefined,
    y: number | undefined,
): CSSProperties {
    const side = placement.split('-')[0] as keyof typeof oppositeSide;

    return {
        left: x,
        top: y,
        [oppositeSide[side]]: ARROW_OFFSET,
    };
}
