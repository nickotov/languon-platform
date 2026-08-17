import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { IconButton } from './icon-button';
const meta = { component: IconButton, title: 'UI/Icon button' } satisfies Meta<
    typeof IconButton
>;
export default meta;
export const Close: StoryObj<typeof meta> = {
    args: { children: '×', label: 'Close' },
};
export const Sizes: StoryObj<typeof meta> = {
    args: { children: '×', label: 'Close' },
    render: () => (
        <div style={{ alignItems: 'center', display: 'flex', gap: 12 }}>
            <IconButton label='Small close' size='small'>
                ×
            </IconButton>
            <IconButton label='Medium close' size='medium'>
                ×
            </IconButton>
            <IconButton label='Large close' size='large'>
                ×
            </IconButton>
        </div>
    ),
};
export const Disabled: StoryObj<typeof meta> = {
    args: { children: '×', disabled: true, label: 'Close' },
};
export const Pressed: StoryObj<typeof meta> = {
    args: { children: '×', label: 'Close (pressed)' },
    render: () => (
        <IconButton data-state='pressed' label='Close (pressed)'>
            ×
        </IconButton>
    ),
};
