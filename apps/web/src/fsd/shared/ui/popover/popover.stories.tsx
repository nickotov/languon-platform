import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Popover } from './popover';
const meta = { component: Popover, title: 'UI/Popover' } satisfies Meta<
    typeof Popover
>;
export default meta;
export const Default: StoryObj<typeof meta> = {
    args: {
        children: (
            <>
                <p>Choose a calm pace now; you can change it later.</p>
                <button type='button'>Use calm pace</button>
            </>
        ),
        label: 'Open practice information',
        trigger: 'Practice info',
    },
};
export const ViewportCollision: StoryObj<typeof meta> = {
    args: {
        children: (
            <>
                <p>
                    This panel flips and shifts instead of leaving the viewport.
                </p>
                <button type='button'>Keep this visible</button>
            </>
        ),
        label: 'Open edge-aware information',
        placement: 'bottom-end',
        trigger: 'Open at the edge',
    },
    decorators: [
        (Story) => (
            <div
                style={{
                    alignItems: 'flex-end',
                    display: 'flex',
                    height: 260,
                    justifyContent: 'flex-end',
                    overflow: 'hidden',
                    width: '100%',
                }}
            >
                <Story />
            </div>
        ),
    ],
    parameters: { viewport: { defaultViewport: 'mobile1' } },
};
