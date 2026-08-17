import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Progress } from './progress';
const meta = { component: Progress, title: 'UI/Progress' } satisfies Meta<
    typeof Progress
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Half: Story = { args: { label: 'Lesson progress', value: 50 } };
