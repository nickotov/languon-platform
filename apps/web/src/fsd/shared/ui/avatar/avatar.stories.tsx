import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Avatar } from './avatar';
export default { title: 'UI/Avatar', component: Avatar } satisfies Meta<
    typeof Avatar
>;
export const States: StoryObj<typeof Avatar> = {
    render: () => (
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <Avatar name='Sofia Reyes' size='sm' />
            <Avatar name='Sofia Reyes' />
            <Avatar name='Sofia Reyes' size='lg' />
            <Avatar />
        </div>
    ),
};
