import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ConversationErrorNotice } from './conversation-error-notice';

const meta = {
    title: 'Widgets/Contextual assistant/Errors',
    component: ConversationErrorNotice,
    args: { onRetry: fn() },
} satisfies Meta<typeof ConversationErrorNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Retryable: Story = { args: { failedTurnCode: null } };
export const RetryPending: Story = {
    args: { failedTurnCode: null, disabled: true },
};
export const NoCredits: Story = {
    args: { failedTurnCode: 'credits_exhausted' },
};
export const Capacity: Story = {
    args: { failedTurnCode: 'capacity_unavailable' },
};
