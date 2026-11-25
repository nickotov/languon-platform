import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { WorkbookResults } from './workbook-results';

const meta = {
    title: 'Pages/Workbooks/Results',
    component: WorkbookResults,
    args: {
        workbooks: [
            {
                id: '11111111-1111-4111-8111-111111111111',
                title: 'Listening practice',
                version: 1,
                shared: false,
                notes: [],
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-01T00:00:00Z',
            },
        ],
        failed: false,
        hasMore: true,
        loading: false,
        onMore: fn(),
    },
} satisfies Meta<typeof WorkbookResults>;

export default meta;
type Story = StoryObj<typeof meta>;
export const MoreAvailable: Story = {};
export const LoadingNextPage: Story = { args: { loading: true } };
export const RetryNextPage: Story = { args: { failed: true } };
export const LastPage: Story = { args: { hasMore: false } };
