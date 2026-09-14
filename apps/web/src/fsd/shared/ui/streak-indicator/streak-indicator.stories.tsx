import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { StreakIndicator } from './streak-indicator';
const week = [true, true, false, true, true, true, true];
export default {
    title: 'UI/Streak indicator',
    component: StreakIndicator,
} satisfies Meta<typeof StreakIndicator>;
export const States: StoryObj<typeof StreakIndicator> = {
    render: () => (
        <div style={{ display: 'grid', gap: 16 }}>
            <StreakIndicator count={12} week={week} />
            <StreakIndicator count={3} variant='inline' activeToday={false} />
            <StreakIndicator
                count={12}
                week={week}
                variant='card'
                description='A short session today keeps your streak going.'
            />
            <StreakIndicator count={0} loading />
        </div>
    ),
};
