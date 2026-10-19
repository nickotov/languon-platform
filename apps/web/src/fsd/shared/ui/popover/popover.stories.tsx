import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useRef, useState } from 'react';
import storyStyles from './popover.stories.module.css';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

const meta = { component: Popover, title: 'UI/Popover' } satisfies Meta<
    typeof Popover
>;

export default meta;

export const Default: StoryObj<typeof meta> = {
    args: {
        children: (
            <>
                <PopoverTrigger aria-label='Open practice information'>
                    Practice info
                </PopoverTrigger>
                <PopoverContent
                    aria-label='Open practice information'
                    align='end'
                >
                    <p>Choose a calm pace now; you can change it later.</p>
                    <button type='button'>Use calm pace</button>
                </PopoverContent>
            </>
        ),
    },
};

export const ViewportCollision: StoryObj<typeof meta> = {
    args: {
        children: (
            <>
                <PopoverTrigger aria-label='Open edge-aware information'>
                    Open at the edge
                </PopoverTrigger>
                <PopoverContent
                    aria-label='Open edge-aware information'
                    side='bottom'
                    align='end'
                >
                    <p>
                        This panel flips and shifts instead of leaving the
                        viewport.
                    </p>
                    <button type='button'>Keep this visible</button>
                </PopoverContent>
            </>
        ),
    },
    decorators: [
        (Story) => (
            <div className={storyStyles.viewport}>
                <Story />
            </div>
        ),
    ],
    parameters: { viewport: { defaultViewport: 'mobile1' } },
};

function ModalContainerExample() {
    const dialogRef = useRef<HTMLDialogElement | null>(null);
    const [open, setOpen] = useState(false);

    function openDialog() {
        dialogRef.current?.showModal();
    }

    function closeDialog() {
        setOpen(false);
        dialogRef.current?.close();
    }

    function resetPopover() {
        setOpen(false);
    }

    return (
        <>
            <button onClick={openDialog} type='button'>
                Open modal example
            </button>
            <dialog
                aria-label='Modal popover example'
                onClose={resetPopover}
                ref={dialogRef}
            >
                <button onClick={closeDialog} type='button'>
                    Close modal
                </button>
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger>Open preferences</PopoverTrigger>
                    <PopoverContent aria-label='Preferences'>
                        <label>
                            Appearance
                            <select defaultValue='system'>
                                <option value='system'>System</option>
                                <option value='light'>Light</option>
                                <option value='dark'>Dark</option>
                            </select>
                        </label>
                    </PopoverContent>
                </Popover>
            </dialog>
        </>
    );
}

export const InsideModal: StoryObj<typeof meta> = {
    args: { children: null },
    render: () => <ModalContainerExample />,
};

export const OversizedContent: StoryObj<typeof meta> = {
    args: {
        children: (
            <>
                <PopoverTrigger aria-label='Open scrollable preferences'>
                    Scrollable preferences
                </PopoverTrigger>
                <PopoverContent
                    aria-label='Open scrollable preferences'
                    align='end'
                >
                    {Array.from({ length: 30 }, (_, index) => (
                        <p key={index}>
                            Preference {index + 1}: keep this content reachable.
                        </p>
                    ))}
                    <button type='button'>Final action</button>
                </PopoverContent>
            </>
        ),
    },
    parameters: { viewport: { defaultViewport: 'mobile1' } },
};
