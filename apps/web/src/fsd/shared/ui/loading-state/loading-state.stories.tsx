import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LoadingState } from './loading-state';
const meta = {
    component: LoadingState,
    title: 'UI/Loading state',
} satisfies Meta<typeof LoadingState>;
export default meta;
export const Default: StoryObj<typeof meta> = {
    args: { children: 'Loading your course…' },
};
