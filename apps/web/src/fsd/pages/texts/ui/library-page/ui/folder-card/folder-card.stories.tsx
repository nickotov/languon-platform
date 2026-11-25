import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { TextFolder } from '@languon/contracts';
import { FolderCard } from './folder-card';

const folder = {
    id: '10000000-0000-4000-8000-000000000002',
    name: 'Spanish reading club',
    description: 'Short articles and stories for our weekly reading group.',
    lifecycle: 'active',
    textCount: 6,
    translatedCount: 4,
    version: 1,
    createdAt: '2026-01-15T09:00:00.000Z',
    updatedAt: '2026-01-15T09:00:00.000Z',
} satisfies TextFolder;

const meta = {
    title: 'Texts/Folder card',
    component: FolderCard,
    parameters: { nextjs: { appDirectory: true } },
    args: {
        folder,
        pending: false,
        onEdit: fn(),
        onShare: fn(),
        onArchive: fn(),
        onRestore: fn(),
    },
} satisfies Meta<typeof FolderCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};
export const Empty: Story = {
    args: {
        folder: {
            ...folder,
            description: null,
            textCount: 0,
            translatedCount: 0,
        },
    },
};
export const Shared: Story = {
    args: { folder: { ...folder, isShared: true } },
};
export const Archived: Story = {
    args: { folder: { ...folder, lifecycle: 'archived' } },
};
