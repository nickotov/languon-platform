'use client';

import type { DialogProps } from '../../types';
import { Dialog } from '../../dialog';

export function AlertDialog(props: Omit<DialogProps, 'role'>) {
    return <Dialog {...props} role='alertdialog' />;
}
