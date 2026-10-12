import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import storyStyles from './review-badge.stories.module.css';
import { ReviewBadge } from './review-badge';

export default {
    title: 'UI/Review badge',
    component: ReviewBadge,
} satisfies Meta<typeof ReviewBadge>;

export const States: StoryObj<typeof ReviewBadge> = {
    render: () => (
        <div className={storyStyles.controls}>
            <ReviewBadge count={8} />
            <ReviewBadge status='overdue' />
            <ReviewBadge status='upcoming' size='sm' />
            <ReviewBadge status='mastered' />
        </div>
    ),
};
