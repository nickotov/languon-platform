import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Skeleton } from './skeleton';
const meta = { component: Skeleton, title: 'UI/Skeleton' } satisfies Meta<
    typeof Skeleton
>;
export default meta;
export const Default: StoryObj<typeof meta> = { args: { height: 48 } };
