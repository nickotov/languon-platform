import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Icon } from './icon';
const meta = { component: Icon, title: 'UI/Icon' } satisfies Meta<typeof Icon>;
export default meta;
export const Decorative: StoryObj<typeof meta> = { args: { children: '✓' } };
