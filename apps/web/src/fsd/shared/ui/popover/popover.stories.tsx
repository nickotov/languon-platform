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
