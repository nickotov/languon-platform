import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Tabs } from './tabs';
const meta = { component: Tabs, title: 'UI/Tabs' } satisfies Meta<typeof Tabs>;
export default meta;
export const Default: StoryObj<typeof meta> = {
    args: {
        label: 'Lesson sections',
        items: [
            { content: 'Lesson overview', label: 'Overview' },
            { content: 'Lesson notes', label: 'Notes' },
        ],
    },
};
