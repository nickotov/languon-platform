import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useEffect } from 'react';

import { Button } from '../button/button';
import {
    clearToasts,
    showToast,
    Toast,
    ToastHost,
    type ToastTone,
} from './toast';

const meta = { title: 'UI/Toast' } satisfies Meta;
export default meta;

export const Tones: StoryObj = {
    render: () => (
        <div style={{ display: 'grid', gap: 8 }}>
            {(['info', 'success', 'warning', 'danger'] as ToastTone[]).map(
                (tone) => (
                    <Toast key={tone} tone={tone}>
                        {tone}: lesson progress updated.
                    </Toast>
                ),
            )}
        </div>
    ),
};

function HostExample({ queue = false }: { queue?: boolean }) {
    useEffect(() => {
        clearToasts();
        return clearToasts;
    }, []);

    return (
        <>
            <Button
                onClick={() => {
                    const count = queue ? 4 : 1;
                    for (let index = 1; index <= count; index += 1) {
                        showToast({
                            content: queue
                                ? `Queued notification ${index}`
                                : 'Lesson saved.',
                            dismissLabel: queue
                                ? `Dismiss notification ${index}`
                                : 'Dismiss notification',
                            duration: null,
                            tone: 'success',
                        });
                    }
                }}
            >
                {queue ? 'Add four notifications' : 'Show notification'}
            </Button>
            <ToastHost label='Notifications' />
        </>
    );
}

export const HostAndStore: StoryObj = {
    render: () => <HostExample />,
};

export const ThreeVisibleAndQueued: StoryObj = {
    render: () => <HostExample queue />,
};

export const PersistentAction: StoryObj = {
    render: () => (
        <Toast
            action={<Button variant='quiet'>Undo</Button>}
            dismissLabel='Dismiss notification'
            onDismiss={() => undefined}
            tone='warning'
        >
            Vocabulary item removed.
        </Toast>
    ),
};
