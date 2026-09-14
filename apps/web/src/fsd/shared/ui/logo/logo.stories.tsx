import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Logo } from './logo';

const meta = {
    component: Logo,
    title: 'UI/Logo',
} satisfies Meta<typeof Logo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Wordmark: Story = { args: {} };
export const Monogram: Story = { args: { monogram: true } };
