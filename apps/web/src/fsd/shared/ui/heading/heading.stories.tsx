import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Heading } from './heading';
const meta = { component: Heading, title: 'UI/Heading' } satisfies Meta<
    typeof Heading
>;
export default meta;
export const Page: StoryObj<typeof meta> = {
    args: { children: 'Your learning space', level: 1 },
};
