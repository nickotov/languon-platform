import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { UserMessage } from './user-message';
export default {
    title: 'UI/User message',
    component: UserMessage,
} satisfies Meta<typeof UserMessage>;
export const States: StoryObj<typeof UserMessage> = {
    render: () => (
        <div role='list' style={{ display: 'grid', gap: 16, maxWidth: 576 }}>
            <UserMessage
                text='Buenos días, quisiera reservar una mesa.'
                timestamp='9:41 AM'
            />
            <UserMessage text='Un momento…' status='sending' />
            <UserMessage text='Gracias.' status='error' onRetry={() => {}} />
        </div>
    ),
};
