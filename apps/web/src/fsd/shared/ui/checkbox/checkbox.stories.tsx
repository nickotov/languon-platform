import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Checkbox } from './checkbox';
const meta = { component: Checkbox, title: 'UI/Checkbox' } satisfies Meta<
    typeof Checkbox
>;
export default meta;
export const Default: StoryObj<typeof meta> = {
    args: { children: 'Include completed lessons' },
};
export const Checked: StoryObj<typeof meta> = {
    args: { children: 'Include completed lessons', defaultChecked: true },
};
export const Indeterminate: StoryObj<typeof meta> = {
    args: { children: 'All lessons', indeterminate: true },
};
export const Disabled: StoryObj<typeof meta> = {
    args: { children: 'Unavailable option', disabled: true },
};
