import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { InlineAlert } from './inline-alert';
const meta = {
    component: InlineAlert,
    title: 'UI/Inline alert',
} satisfies Meta<typeof InlineAlert>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Error: Story = {
    args: { children: 'We could not save your changes.', tone: 'danger' },
};
export const Success: Story = {
    args: { children: 'Your password was changed.', tone: 'success' },
};
