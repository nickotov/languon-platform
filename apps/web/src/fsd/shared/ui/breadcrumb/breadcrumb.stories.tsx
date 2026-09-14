import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Breadcrumb } from './breadcrumb';
export default { title: 'UI/Breadcrumb', component: Breadcrumb } satisfies Meta<
    typeof Breadcrumb
>;
export const Collapsed: StoryObj<typeof Breadcrumb> = {
    args: {
        showHomeIcon: true,
        maxVisibleItems: 4,
        items: [
            { label: 'Spanish', href: '#' },
            { label: 'A1', href: '#' },
            { label: 'Unit 3', href: '#' },
            { label: 'Grammar', href: '#' },
            { label: 'Gendered articles' },
        ],
    },
};
