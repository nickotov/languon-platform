import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { TextSchema } from '@languon/contracts';
import { TextRow } from './text-row';

const document = TextSchema.parse({
    id: '10000000-0000-4000-8000-000000000001',
    folderId: null,
    title: 'A morning at the market',
    sourceLanguage: 'es',
    targetLanguage: 'en',
    sourceText: 'Hoy compramos pan y fruta en el mercado.',
    alignment: null,
    status: 'draft',
    lifecycle: 'active',
    version: 1,
    createdAt: '2026-01-15T09:00:00.000Z',
    updatedAt: '2026-01-15T09:00:00.000Z',
});

const meta = {
    title: 'Texts/Text row',
    component: TextRow,
    args: {
        document,
        pending: false,
        readOnly: false,
        onAction: fn(),
        onRestore: fn(),
    },
} satisfies Meta<typeof TextRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Draft: Story = {};
export const SharedReadOnly: Story = {
    args: {
        document: { ...document, status: 'translated', isShared: true },
        readOnly: true,
    },
};
export const Archived: Story = {
    args: { document: { ...document, lifecycle: 'archived' } },
};
export const Pending: Story = {
    args: { document: { ...document, status: 'edited' }, pending: true },
};
