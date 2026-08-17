import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Text } from './text';
const meta = { component: Text, title: 'UI/Text' } satisfies Meta<typeof Text>;
export default meta;
export const Default: StoryObj<typeof meta> = {
    args: { children: 'Language learning with room to breathe.' },
};
