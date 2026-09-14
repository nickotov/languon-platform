import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ExerciseCard } from './exercise-card';
const options = [
    { id: 'a', label: 'la casa', hint: 'the house', isCorrect: true },
    { id: 'b', label: 'el casa', hint: 'the house' },
];
export default {
    title: 'UI/Exercise card',
    component: ExerciseCard,
} satisfies Meta<typeof ExerciseCard>;
export const Default: StoryObj<typeof ExerciseCard> = {
    args: {
        instruction: 'Choose the correct article',
        question: 'Which answer is correct?',
        options,
        selectedOptionId: 'a',
        hint: 'Think about the noun’s gender.',
        progressLabel: '3 of 10',
    },
};
export const Correct: StoryObj<typeof ExerciseCard> = {
    args: {
        question: 'Which answer is correct?',
        options,
        selectedOptionId: 'a',
        status: 'correct',
        feedback: 'Correct — casa is feminine.',
    },
};
export const Loading: StoryObj<typeof ExerciseCard> = {
    args: { question: 'Loading', options: [], status: 'loading' },
};
