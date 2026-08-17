import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Button } from '../button/button';
import { Toast, ToastProvider, ToastRegion, useToast } from './toast';

const meta = { title: 'UI/Toast' } satisfies Meta;
export default meta;

export const Status: StoryObj = {
    render: () => (
        <ToastRegion label='Notifications'>
            <Toast
                dismissLabel='Dismiss notification'
                onDismiss={() => undefined}
            >
                Lesson saved.
            </Toast>
        </ToastRegion>
    ),
};

export const PersistentAction: StoryObj = {
    render: () => (
        <ToastRegion label='Notifications'>
            <Toast
                action={<Button variant='quiet'>Undo</Button>}
                dismissLabel='Dismiss notification'
                onDismiss={() => undefined}
            >
                Vocabulary item removed.
            </Toast>
        </ToastRegion>
    ),
};

function QueueExample() {
    const { showToast } = useToast();
    return (
        <Button
            onClick={() => {
                for (let index = 1; index <= 4; index += 1) {
                    showToast({
                        content: `Queued notification ${index}`,
                        dismissLabel: `Dismiss notification ${index}`,
                        duration: null,
                    });
                }
            }}
        >
            Add four notifications
        </Button>
    );
}

export const ThreeVisibleAndQueued: StoryObj = {
    render: () => (
        <ToastProvider label='Notifications'>
            <QueueExample />
        </ToastProvider>
    ),
};
