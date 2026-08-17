import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Spinner } from './spinner';
const meta = { component: Spinner, title: 'UI/Spinner' } satisfies Meta<
    typeof Spinner
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: { label: 'Loading' } };
