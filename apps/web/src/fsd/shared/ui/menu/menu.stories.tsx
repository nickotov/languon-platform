import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Menu } from './menu';
const meta = { component: Menu, title: 'UI/Menu' } satisfies Meta<typeof Menu>;
export default meta;
export const Default: StoryObj<typeof meta> = {
    args: {
        items: [
            { label: 'Rename', onSelect() {} },
            { disabled: true, label: 'Duplicate', onSelect() {} },
            { label: 'Remove', onSelect() {}, tone: 'danger' },
        ],
        label: 'Passkey actions',
        trigger: 'Actions',
    },
};
