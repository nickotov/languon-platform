import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Switch } from './switch';
const meta = { component: Switch, title: 'UI/Switch' } satisfies Meta<
    typeof Switch
>;
export default meta;
export const Default: StoryObj<typeof meta> = {
    args: { children: 'Practice reminders' },
};
export const On: StoryObj<typeof meta> = {
    args: { children: 'Practice reminders', defaultChecked: true },
};
export const Disabled: StoryObj<typeof meta> = {
    args: { children: 'Practice reminders', disabled: true },
};
