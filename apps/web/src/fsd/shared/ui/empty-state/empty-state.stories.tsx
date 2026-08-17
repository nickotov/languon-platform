import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from '../button/button';
import { EmptyState, ErrorState } from './empty-state';
const meta = { component: EmptyState, title: 'UI/Empty state' } satisfies Meta<
    typeof EmptyState
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
    args: {
        children: 'Add your first passkey to sign in without a password.',
        title: 'No passkeys yet',
    },
};
export const FailedRegion: Story = {
    args: { title: 'Unable to load passkeys' },
    render: () => (
        <ErrorState
            action={<Button variant='secondary'>Try again</Button>}
            title='Unable to load passkeys'
        >
            Check your connection and try again.
        </ErrorState>
    ),
};
