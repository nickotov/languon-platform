import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import storyStyles from './icon-button.stories.module.css';
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
        <div className={storyStyles.controls}>
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

export const NearViewportBottom: StoryObj<typeof meta> = {
    args: {
        children: '◐',
        label: 'Change theme',
        tooltipPlacement: 'bottom',
    },
    decorators: [
        (Story) => (
            <div className={storyStyles.viewport}>
                <Story />
            </div>
        ),
    ],
};
