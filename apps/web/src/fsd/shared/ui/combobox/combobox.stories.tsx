import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Combobox } from './combobox';
const meta = { component: Combobox, title: 'UI/Combobox' } satisfies Meta<
    typeof Combobox
>;
export default meta;
export const Default: StoryObj<typeof meta> = {
    args: {
        'aria-label': 'Learning language',
        options: [
            { label: 'Spanish', value: 'Spanish' },
            { label: 'French', value: 'French' },
        ],
    },
};
export const Empty: StoryObj<typeof meta> = {
    args: {
        'aria-label': 'Learning language',
        defaultValue: 'German',
        emptyMessage: 'No matching languages',
        options: [{ label: 'Spanish', value: 'Spanish' }],
    },
};
export const Loading: StoryObj<typeof meta> = {
    args: {
        'aria-label': 'Learning language',
        loading: true,
        loadingMessage: 'Loading languages',
        options: [],
    },
};
