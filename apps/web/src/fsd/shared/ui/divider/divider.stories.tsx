import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Divider } from './divider';
const meta = { component: Divider, title: 'UI/Divider' } satisfies Meta<
    typeof Divider
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Rule: Story = {};
export const Labelled: Story = { args: { children: 'or' } };
