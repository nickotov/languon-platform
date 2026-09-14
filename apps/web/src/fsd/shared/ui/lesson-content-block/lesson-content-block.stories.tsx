import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LessonContentBlock } from './lesson-content-block';
export default {
    title: 'UI/Lesson content block',
    component: LessonContentBlock,
} satisfies Meta<typeof LessonContentBlock>;
export const Reading: StoryObj<typeof LessonContentBlock> = {
    args: {
        eyebrow: 'Unit 3 · Grammar',
        title: 'Gendered articles',
        summary: 'Learn when to use el and la.',
        bordered: true,
        children: (
            <>
                <p>Spanish nouns have grammatical gender.</p>
                <blockquote>
                    Listen for the article when learning a new word.
                </blockquote>
            </>
        ),
    },
};
