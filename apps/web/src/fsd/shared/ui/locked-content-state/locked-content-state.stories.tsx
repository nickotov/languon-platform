import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LockedContentState } from './locked-content-state';
export default {
    title: 'UI/Locked content state',
    component: LockedContentState,
} satisfies Meta<typeof LockedContentState>;
export const Placeholder: StoryObj<typeof LockedContentState> = {
    args: { eyebrow: 'Unit 3 · Lesson 2', actionLabel: 'Continue learning' },
};
export const Overlay: StoryObj<typeof LockedContentState> = {
    args: {
        variant: 'overlay',
        children: (
            <div style={{ padding: 32 }}>
                A preview of the lesson content behind the lock.
            </div>
        ),
    },
};
