import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { I18nProvider } from '@/fsd/shared/i18n';
import { en } from '@/fsd/shared/i18n/messages/en';

import { DictionaryExportPanel } from './dictionary-export-panel';

const meta = {
    component: DictionaryExportPanel,
    decorators: [
        (Story) => (
            <I18nProvider locale='en' messages={en}>
                <Story />
            </I18nProvider>
        ),
    ],
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
