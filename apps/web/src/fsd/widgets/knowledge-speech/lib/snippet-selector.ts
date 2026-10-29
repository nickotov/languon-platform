import type { LearningBlock, SpeechSource } from '@languon/contracts';

type Selector = Extract<
    SpeechSource,
    { kind: 'knowledge-snippet' }
>['selector'];

/** Select persisted source fields; never forward a renderer's arbitrary text. */
export function knowledgeSnippetSelector(
    block: LearningBlock,
    text: string,
    language: string,
): Selector | null {
    if (
        block.type !== 'vocabulary' &&
        block.type !== 'grammar' &&
        block.type !== 'bilingual-text'
    )
        return null;
    if (
        !('language' in block) ||
        block.language.toLowerCase() !== language.toLowerCase()
    )
        return null;
    if (block.type === 'vocabulary') {
        for (const entry of block.entries) {
            if (entry.term === text)
                return { kind: 'vocabulary', entryId: entry.id, field: 'term' };
            if (entry.example === text)
                return {
                    kind: 'vocabulary',
                    entryId: entry.id,
                    field: 'example',
                };
        }
    }
    if (block.type === 'grammar') {
        const index =
            block.examples?.findIndex((example) => example.text === text) ?? -1;
        if (index >= 0) return { kind: 'grammar-example', index };
    }
    if (block.type === 'bilingual-text') {
        const segment = block.segments.find((item) => item.text === text);
        if (segment) return { kind: 'bilingual', segmentId: segment.id };
        if (block.segments.map((item) => item.text).join('\n\n') === text)
            return { kind: 'bilingual' };
    }
    return null;
}
