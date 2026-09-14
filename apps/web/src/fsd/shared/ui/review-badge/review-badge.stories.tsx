import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ReviewBadge } from './review-badge';
export default {
    title: 'UI/Review badge',
    component: ReviewBadge,
} satisfies Meta<typeof ReviewBadge>;
export const States: StoryObj<typeof ReviewBadge> = {
    render: () => (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <ReviewBadge count={8} />
            <ReviewBadge status='overdue' />
            <ReviewBadge status='upcoming' size='sm' />
            <ReviewBadge status='mastered' />
        </div>
    ),
};
