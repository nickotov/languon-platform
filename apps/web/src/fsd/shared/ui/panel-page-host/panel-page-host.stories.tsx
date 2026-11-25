import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../button';
import { Input } from '../input/input';
import { PanelPageHost, usePanelOutlet } from './panel-page-host';

function ReviewExample() {
    const [open, setOpen] = useState(false);
    const outlet = usePanelOutlet();

    function closeReview() {
        setOpen(false);
        outlet?.restoreOpener();
    }

    return (
        <>
            <Input label='Draft title' defaultValue='At the market' />
            <Button onClick={() => setOpen(true)}>Review draft</Button>
            {open &&
                outlet?.element &&
                createPortal(
                    <section aria-label='Draft review'>
                        <p>Check the title before publishing.</p>
                        <Button onClick={closeReview}>Back to draft</Button>
                    </section>,
                    outlet.element,
                )}
        </>
    );
}

const meta = {
    title: 'UI/Panel page host',
    component: PanelPageHost,
    args: { children: <ReviewExample /> },
} satisfies Meta<typeof PanelPageHost>;

export default meta;
export const ReviewAndReturn: StoryObj<typeof meta> = {};
