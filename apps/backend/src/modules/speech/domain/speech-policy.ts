import { createHmac } from 'node:crypto';

export const NORMALIZATION_REVISION = 'nfc-horizontal-whitespace-v1';
export const ELIGIBILITY_REVISION = 'intl-word-codepoint-v1';

export function normalizeSpeechText(text: string): string {
    return text
        .normalize('NFC')
        .replace(/\r\n|[\r\v\f\u0085\u2028\u2029]/gu, '\n')
        .replace(/[^\S\n]+/gu, ' ')
        .trim();
}

export function inspectSpeechText(text: string, language: string) {
    const normalized = normalizeSpeechText(text);
    const characterCount = [...normalized].length;
    const wordCount = [
        ...new Intl.Segmenter(language, { granularity: 'word' }).segment(
            normalized,
        ),
    ].filter((part) => part.isWordLike).length;
    return {
        normalized,
        characterCount,
        wordCount,
        free: wordCount <= 10 && characterCount <= 100,
    };
}

export function speechTextIdentity(
    secret: string,
    language: string,
    normalized: string,
    recordingClass?: 'fixture' | 'pronunciation',
): string {
    return createHmac('sha256', secret)
        .update(
            JSON.stringify([
                NORMALIZATION_REVISION,
                language,
                normalized,
                ...(recordingClass ? [recordingClass] : []),
            ]),
        )
        .digest('hex');
}

export { calculateSpeechPrice as speechPrice } from '../../ai-credits/domain/model-price';

export class SpeechError extends Error {
    public constructor(
        public readonly code: string,
        public readonly status: 400 | 403 | 404 | 409 | 429 | 503 = 409,
    ) {
        super(code);
        this.name = 'SpeechError';
    }
}
