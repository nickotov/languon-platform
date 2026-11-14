import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PromptRecipe } from './prompt-recipe';
import { guideUiCopy } from '../copy';

const meta = {
    title: 'Pages/Workbook guide/Prompt recipe',
    component: PromptRecipe,
    args: {
        title: 'One specific exercise',
        text: 'Using the selected vocabulary, create one V02 exercise for an A2 English learner. Include the answer and a brief explanation.\n\nborrow — take something temporarily and give it back',
        copyLabel: 'Copy prompt and source',
        copy: guideUiCopy('en'),
    },
} satisfies Meta<typeof PromptRecipe>;

export default meta;
export const Default: StoryObj<typeof meta> = {};
export const LongLocalized: StoryObj<typeof meta> = {
    args: {
        title: 'Конкретное упражнение по выбранному материалу',
        copy: guideUiCopy('ru'),
        copyLabel: 'Копировать запрос и материал',
    },
};
