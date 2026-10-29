import type { LearningBlock, SpeechSource } from '@languon/contracts';
import { SpeechError } from './speech-policy';

type Selector = Extract<
    SpeechSource,
    { kind: 'knowledge-snippet' }
>['selector'];

/** Exact source-only extraction keeps language and pronunciation authority together. */
export function knowledgeSnippetText(block: LearningBlock, selector: Selector) {
    let text: string | undefined;
    let language: string | undefined;
    if (block.type === 'vocabulary' && selector.kind === 'vocabulary') {
        const entry = block.entries.find(
            (item) => item.id === selector.entryId,
        );
        text = entry?.[selector.field];
        language = block.language;
    }
    if (block.type === 'grammar' && selector.kind === 'grammar-example') {
        text = block.examples?.[selector.index]?.text;
        language = block.language;
    }
    if (block.type === 'bilingual-text' && selector.kind === 'bilingual') {
        text = selector.segmentId
            ? block.segments.find((item) => item.id === selector.segmentId)
                  ?.text
            : block.segments.map((item) => item.text).join('\n\n');
        language = block.language;
    }
    if (!text?.trim() || !language)
        throw new SpeechError('speech_text_unavailable', 400);
    return { text, language };
}
