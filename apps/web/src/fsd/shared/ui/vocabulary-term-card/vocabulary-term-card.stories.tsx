import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { VocabularyTermCard } from './vocabulary-term-card';
export default {
    title: 'UI/Vocabulary term card',
    component: VocabularyTermCard,
} satisfies Meta<typeof VocabularyTermCard>;
export const Default: StoryObj<typeof VocabularyTermCard> = {
    args: {
        term: 'la casa',
        translation: 'the house',
        partOfSpeech: 'noun',
        pronunciation: '/ˈka.sa/',
        example: 'La casa es muy grande.',
        exampleTranslation: 'The house is very big.',
        saved: true,
        onPlayAudio: () => {},
        onToggleSave: () => {},
    },
};
export const Flashcard: StoryObj<typeof VocabularyTermCard> = {
    args: {
        term: 'rápidamente',
        translation: 'quickly',
        partOfSpeech: 'adverb',
        hideTranslation: true,
    },
};
