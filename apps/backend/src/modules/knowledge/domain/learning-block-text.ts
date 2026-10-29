import type { LearningBlock } from '@languon/contracts';

/** Project authored learning content, never asset keys or learner state. */
export function learningBlockPlainText(block: LearningBlock): string {
    const parts: string[] = [];
    if (block.title) parts.push(block.title);
    switch (block.type) {
        case 'video':
            parts.push('Video');
            for (const segment of block.transcript?.segments ?? [])
                parts.push(segment.text);
            break;
        case 'audio':
            parts.push('Audio');
            if (block.sourceText) parts.push(block.sourceText);
            for (const segment of block.transcript?.segments ?? [])
                parts.push(segment.text);
            break;
        case 'vocabulary':
            for (const entry of block.entries)
                parts.push(
                    entry.term,
                    entry.translation,
                    entry.definition ?? '',
                    entry.pronunciation ?? '',
                    entry.example ?? '',
                    entry.exampleTranslation ?? '',
                );
            break;
        case 'bilingual-text':
            for (const segment of block.segments) {
                parts.push(segment.text);
                for (const translation of block.translations) {
                    const translated = translation.segments.find(
                        (item) => item.sourceSegmentId === segment.id,
                    );
                    if (translated) parts.push(translated.text);
                }
            }
            break;
        case 'grammar':
            parts.push(block.rule ?? '', block.pattern ?? '');
            for (const example of block.examples ?? [])
                parts.push(example.text, example.translation ?? '');
            for (const mistake of block.commonMistakes ?? [])
                parts.push(
                    mistake.incorrect,
                    mistake.correct,
                    mistake.explanation ?? '',
                );
            break;
        case 'exercise':
            parts.push(block.question);
            if (block.format === 'multiple-choice')
                parts.push(...block.choices.map((choice) => choice.text));
            if (block.format === 'fill-in-the-blank')
                for (const part of block.parts)
                    parts.push(
                        part.kind === 'text'
                            ? part.text
                            : part.acceptedAnswers.join(' / '),
                    );
            if (block.format === 'free-text')
                parts.push(...(block.acceptedAnswers ?? []));
            parts.push(
                block.referenceAnswer,
                block.explanation,
                block.evaluationCriteria ?? '',
            );
            break;
    }
    return parts.filter(Boolean).join('\n');
}
