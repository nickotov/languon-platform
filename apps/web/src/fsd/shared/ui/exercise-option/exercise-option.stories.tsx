import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ExerciseOption } from './exercise-option';
export default {
    title: 'UI/Exercise option',
    component: ExerciseOption,
} satisfies Meta<typeof ExerciseOption>;
export const States: StoryObj<typeof ExerciseOption> = {
    render: () => (
        <div
            role='radiogroup'
            style={{ display: 'grid', gap: 8, maxWidth: 560 }}
        >
            {(['default', 'selected', 'correct', 'incorrect'] as const).map(
                (state, index) => (
                    <ExerciseOption
                        key={state}
                        label={`Answer ${index + 1}`}
                        shortcut={String(index + 1)}
                        hint='Optional translation'
                        state={state}
                    />
                ),
            )}
        </div>
    ),
};
