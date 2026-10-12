import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import storyStyles from './avatar.stories.module.css';
import { Avatar } from './avatar';

export default { title: 'UI/Avatar', component: Avatar } satisfies Meta<
    typeof Avatar
>;

export const States: StoryObj<typeof Avatar> = {
    render: () => (
        <div className={storyStyles.controls}>
            <Avatar name='Sofia Reyes' size='sm' />
            <Avatar name='Sofia Reyes' />
            <Avatar name='Sofia Reyes' size='lg' />
            <Avatar />
        </div>
    ),
};
