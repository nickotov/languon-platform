import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ExerciseActivityBrowser } from './exercise-activity-browser';

function choose() {}

const meta = {
    title: 'Learning/Exercise activity browser',
    component: ExerciseActivityBrowser,
    args: { locale: 'en', onChoose: choose, onPreview: choose },
} satisfies Meta<typeof ExerciseActivityBrowser>;

export default meta;
export const AllActivities: StoryObj<typeof meta> = {};
export const RussianNames: StoryObj<typeof meta> = { args: { locale: 'ru' } };
export const NoResults: StoryObj<typeof meta> = {
    args: { query: 'not-a-real-activity' },
};
