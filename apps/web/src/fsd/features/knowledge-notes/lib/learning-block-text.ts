import { LearningBlockSchema, type LearningBlock } from '@languon/contracts';
import type { Node } from '@tiptap/pm/model';

/** Human-readable block context; never implies that remote media was fetched. */
export function learningBlockPlainText(block: LearningBlock): string {
    const parts = [block.title ?? ''];
    if (block.type === 'grammar') {
        parts.push(block.rule ?? '', block.pattern ?? '');
        block.examples?.forEach((item) =>
            parts.push(item.text, item.translation ?? ''),
        );
        block.commonMistakes?.forEach((item) =>
            parts.push(item.incorrect, item.correct, item.explanation ?? ''),
        );
    }
    if (block.type === 'vocabulary')
        block.entries.forEach((item) =>
            parts.push(
                item.term,
                item.translation,
                item.pronunciation ?? '',
                item.definition ?? '',
                item.example ?? '',
                item.exampleTranslation ?? '',
            ),
        );
    if (block.type === 'bilingual-text') {
        block.segments.forEach((item) => parts.push(item.text));
        block.translations.forEach((translation) =>
            translation.segments.forEach((item) => parts.push(item.text)),
        );
    }
    if (block.type === 'video')
        parts.push(
            block.source.kind === 'youtube'
                ? `YouTube: ${block.source.videoId}`
                : block.source.url,
        );
    if (block.type === 'audio') parts.push(block.sourceText ?? '');
    if (block.type === 'audio' || block.type === 'video')
        block.transcript?.segments.forEach((item) => parts.push(item.text));
    if (block.type === 'exercise') {
        parts.push(
            block.question,
            block.referenceAnswer,
            block.explanation,
            block.evaluationCriteria ?? '',
        );
        if (block.format === 'multiple-choice')
            block.choices.forEach((item) => parts.push(item.text));
        if (block.format === 'fill-in-the-blank')
            block.parts.forEach((part) =>
                parts.push(
                    part.kind === 'text'
                        ? part.text
                        : part.acceptedAnswers.join(' / '),
                ),
            );
        if (block.format === 'free-text')
            parts.push(...(block.acceptedAnswers ?? []));
    }
    return parts.filter(Boolean).join('\n');
}

export function editorLeafText(node: Node): string {
    if (node.type.name !== 'learningBlock') return '\n';
    return `\n${learningBlockPlainText(LearningBlockSchema.parse(node.attrs.block))}\n`;
}
