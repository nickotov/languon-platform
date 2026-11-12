'use client';

import type { DialogProps } from '../../types';
import { Dialog } from '../../dialog';

export function BottomSheet(
    props: Omit<DialogProps, 'closeLabel' | 'variant'> & { closeLabel: string },
) {
    return <Dialog {...props} variant='sheet' />;
}
