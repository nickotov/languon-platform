import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
    exerciseActivityExamples,
    exerciseExampleLabels,
} from '../../examples';
import { LearningExerciseSet } from './learning-exercise-set';

const entries = exerciseActivityExamples('en')
    .slice(0, 3)
    .map(({ block }) => ({ block }));

const meta = {
    title: 'Learning/Exercise set',
    component: LearningExerciseSet,
    args: { entries, labels: exerciseExampleLabels('en') },
} satisfies Meta<typeof LearningExerciseSet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Learner: Story = {};
export const CompactPreview: Story = { args: { variant: 'compact' } };
