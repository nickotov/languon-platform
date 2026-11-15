import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ExerciseActivityPreview } from './exercise-activity-preview';

function close() {}

const meta = {
    title: 'Learning/Exercise activity preview',
    component: ExerciseActivityPreview,
    args: { locale: 'en', activityId: 'V02', open: true, onClose: close },
} satisfies Meta<typeof ExerciseActivityPreview>;

export default meta;
export const PreparedAnswer: StoryObj<typeof meta> = {};
export const IllustrativeFeedback: StoryObj<typeof meta> = {
    args: { activityId: 'R04' },
};
export const MobileRussian: StoryObj<typeof meta> = {
    args: { locale: 'ru', activityId: 'W01' },
    parameters: { viewport: { defaultViewport: 'mobile1' } },
};
