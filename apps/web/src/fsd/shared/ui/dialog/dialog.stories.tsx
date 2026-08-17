import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';

import { Button } from '../button/button';
import { AlertDialog, BottomSheet, Dialog } from './dialog';

const meta = { title: 'UI/Dialog' } satisfies Meta;
export default meta;

function DialogExample({
    kind = 'dialog',
}: {
    kind?: 'alert' | 'dialog' | 'sheet';
}) {
    const [open, setOpen] = useState(false);
    const Component =
        kind === 'alert'
            ? AlertDialog
            : kind === 'sheet'
              ? BottomSheet
              : Dialog;
    const props = {
        children: (
            <Button onClick={() => setOpen(false)} variant='danger'>
                Remove passkey
            </Button>
        ),
        closeLabel: 'Close dialog',
        description: 'You will no longer be able to use this passkey.',
        onClose: () => setOpen(false),
        open,
        title: 'Remove passkey?',
    };

    return (
        <>
            <Button onClick={() => setOpen(true)}>Open {kind}</Button>
            <Component {...props} />
        </>
    );
}

export const Default: StoryObj = { render: () => <DialogExample /> };
export const UrgentDecision: StoryObj = {
    render: () => <DialogExample kind='alert' />,
};
export const CompactBottomSheet: StoryObj = {
    render: () => <DialogExample kind='sheet' />,
};
