import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from '../button/button';
import { CompanionLayout, useCompanionLayout } from './companion-layout';

const meta = { title: 'UI/CompanionLayout' } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function Source() {
    const layout = useCompanionLayout();
    function toggleExpanded() {
        if (layout) layout.setExpanded(!layout.expanded);
    }
    return (
        <>
            <h2>Source workspace</h2>
            <p>Open the companion to reserve a column beside this content.</p>
            <Button onClick={toggleExpanded}>Toggle companion</Button>
        </>
    );
}
function Companion() {
    const layout = useCompanionLayout();
    function toggleDetached() {
        if (layout) layout.setDetached(!layout.detached);
    }
    function toggleHalfWidth() {
        if (layout) layout.setHalfWidth(!layout.halfWidth);
    }
    if (!layout?.expanded) return null;
    return (
        <>
            <Button onClick={toggleDetached}>
                {layout.detached ? 'Reattach companion' : 'Detach companion'}
            </Button>
            <Button onClick={toggleHalfWidth}>
                {layout.halfWidth ? 'Use default width' : 'Use half width'}
            </Button>
        </>
    );
}
function Example() {
    return (
        <CompanionLayout companion={<Companion />}>
            <Source />
        </CompanionLayout>
    );
}
export const Slots: Story = { render: Example };

export const ResizableWorkspace: Story = {
    render: () => (
        <CompanionLayout variant='workspace' companion={<Companion />}>
            <Source />
            <p>
                Drag the companion boundary, or focus it and use arrow keys,
                Home and End. Escape cancels an active drag.
            </p>
        </CompanionLayout>
    ),
};
