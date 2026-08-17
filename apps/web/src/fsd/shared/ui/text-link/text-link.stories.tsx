import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TextLink } from './text-link';
const meta = { component: TextLink, title: 'UI/Text link' } satisfies Meta<
    typeof TextLink
>;
export default meta;
export const Default: StoryObj<typeof meta> = {
    args: { children: 'Open security settings', href: '#' },
};
