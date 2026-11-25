import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { DictionaryExportPanel } from './dictionary-export-panel';

const meta = {
    component: DictionaryExportPanel,
    args: {
        onExport: async () => undefined,
        pending: false,
    },
    title: 'Features/Dictionary interchange/Export',
} satisfies Meta<typeof DictionaryExportPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Ready: Story = {};

export const Pending: Story = { args: { pending: true } };
