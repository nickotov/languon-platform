import type { LearningBlock } from '@languon/contracts';
import { SpeechError } from './speech-policy';

/** Never combine translated/explanation-language prose into a studied-language voice. */
export function knowledgeNarrationText(
    block: LearningBlock,
    studiedLanguage: string | null,
    explanationLanguage: string | null,
) {
    let text = '',
        language: string | null = null;
    if (block.type === 'bilingual-text') {
        text = block.segments.map((segment) => segment.text).join('\n');
        language = block.language;
    }
    if (block.type === 'vocabulary') {
        text = block.entries
            .flatMap((entry) => [entry.term, entry.example ?? ''])
            .filter(Boolean)
            .join('\n');
        language = block.language;
    }
    if (block.type === 'grammar') {
        if (block.examples?.length) {
            text = block.examples.map((example) => example.text).join('\n');
            language = block.language;
        } else if (block.pattern) {
            text = block.pattern;
            language = block.language;
        } else if (block.rule) {
            text = block.rule;
            language = explanationLanguage;
        }
    }
    if (block.type === 'audio') {
        text = block.sourceText ?? '';
        language = studiedLanguage;
    }
    if (!language || !text.trim())
        throw new SpeechError('speech_text_unavailable', 400);
    return { text, language };
}
