import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';

import { Button } from '../button/button';
import { AlertDialog, BottomSheet, Dialog, DialogActions } from './dialog';

const meta = { title: 'UI/Dialog' } satisfies Meta;

export default meta;

function DialogExample({
    kind = 'dialog',
    size = 'md',
}: {
    kind?: 'alert' | 'dialog' | 'sheet';
    size?: 'md' | 'viewport';
}) {
    const [open, setOpen] = useState(false);

    function resolveComponent() {
        if (kind === 'alert') {
            return AlertDialog;
        }

        if (kind === 'sheet') {
            return BottomSheet;
        }

        return Dialog;
    }

    const Component = resolveComponent();

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
        size,
    };

    return (
        <>
            <Button onClick={() => setOpen(true)}>Open {kind}</Button>
            <Component {...props} />
        </>
    );
}

export const Default: StoryObj = { render: () => <DialogExample /> };

export const Viewport: StoryObj = {
    render: () => <DialogExample size='viewport' />,
};

export const UrgentDecision: StoryObj = {
    render: () => <DialogExample kind='alert' />,
};

export const CompactBottomSheet: StoryObj = {
    render: () => <DialogExample kind='sheet' />,
};

function FooterExample({
    raw = false,
    long = false,
}: {
    raw?: boolean;
    long?: boolean;
}) {
    const [open, setOpen] = useState(true);
    function show() {
        setOpen(true);
    }

    function close() {
        setOpen(false);
    }

    const actions = long ? (
        <>
            <Button variant='secondary' onClick={close}>
                Продолжить
            </Button>
            <Button variant='secondary' onClick={close}>
                Копировать
            </Button>
            <Button variant='danger' onClick={close}>
                Заменить
            </Button>
        </>
    ) : (
        <>
            <Button variant='secondary' onClick={close}>
                Cancel
            </Button>
            <Button onClick={close}>Save</Button>
        </>
    );

    return (
        <>
            <Button onClick={show}>Open footer example</Button>
            <Dialog
                open={open}
                onClose={close}
                title='Review changes'
                footer={
                    raw ? actions : <DialogActions>{actions}</DialogActions>
                }
            >
                <p>
                    Review the current dictionary before replacing it. Actions
                    use concise single-line labels; mobile can reflow.
                </p>
            </Dialog>
        </>
    );
}

export const FooterActions: StoryObj = { render: () => <FooterExample /> };
export const LongLocalizedFooter: StoryObj = {
    render: () => <FooterExample long />,
};
export const DirectFooterActions: StoryObj = {
    render: () => <FooterExample raw />,
};
