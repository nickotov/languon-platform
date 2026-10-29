import {
    AudioLines,
    BookA,
    BookOpenText,
    Clapperboard,
    ListChecks,
    SpellCheck2,
} from 'lucide-react';
import type { LearningBlock } from '@languon/contracts';

export const learningBlockIcons = {
    vocabulary: BookA,
    'bilingual-text': BookOpenText,
    grammar: SpellCheck2,
    video: Clapperboard,
    audio: AudioLines,
    exercise: ListChecks,
};

export function learningBlockCount(block: LearningBlock) {
    if (block.type === 'vocabulary') return block.entries.length;
    if (block.type === 'bilingual-text') return block.segments.length;
    if (block.type === 'grammar')
        return [
            block.rule,
            block.pattern,
            block.examples?.length,
            block.commonMistakes?.length,
        ].filter(Boolean).length;
    if (block.type === 'exercise') return undefined;
    return undefined;
}
