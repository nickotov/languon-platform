export interface DictionaryLanguagePair {
    sourceLanguageTag: string;
    targetLanguageTag: string;
}

export type InvalidLanguagePairReason =
    'locked' | 'same_language' | 'unsupported_language';

export class InvalidDictionaryLanguagePairError extends Error {
    public constructor(public readonly reason: InvalidLanguagePairReason) {
        super(`The dictionary language pair is invalid (${reason}).`);
        this.name = 'InvalidDictionaryLanguagePairError';
    }
}

export type SupportsLanguageTag = (canonicalTag: string) => boolean;

function canonicalizeLanguageTag(input: string): string {
    try {
        const [canonical] = Intl.getCanonicalLocales(input.trim());

        if (!canonical) {
            throw new RangeError('Missing canonical language tag.');
        }

        return canonical;
    } catch {
        throw new InvalidDictionaryLanguagePairError('unsupported_language');
    }
}

export function validateDictionaryLanguagePair(
    input: DictionaryLanguagePair,
    supportsLanguageTag: SupportsLanguageTag,
): DictionaryLanguagePair {
    const sourceLanguageTag = canonicalizeLanguageTag(input.sourceLanguageTag);
    const targetLanguageTag = canonicalizeLanguageTag(input.targetLanguageTag);

    if (
        !supportsLanguageTag(sourceLanguageTag) ||
        !supportsLanguageTag(targetLanguageTag)
    ) {
        throw new InvalidDictionaryLanguagePairError('unsupported_language');
    }
    if (sourceLanguageTag === targetLanguageTag) {
        throw new InvalidDictionaryLanguagePairError('same_language');
    }

    return { sourceLanguageTag, targetLanguageTag };
}

export function changeDictionaryLanguagePair(input: {
    cardCount: number;
    current: DictionaryLanguagePair;
    next: DictionaryLanguagePair;
    supportsLanguageTag: SupportsLanguageTag;
}): DictionaryLanguagePair {
    if (!Number.isSafeInteger(input.cardCount) || input.cardCount < 0) {
        throw new RangeError(
            'A dictionary card count must be a non-negative integer.',
        );
    }

    const current = validateDictionaryLanguagePair(
        input.current,
        input.supportsLanguageTag,
    );
    const next = validateDictionaryLanguagePair(
        input.next,
        input.supportsLanguageTag,
    );

    if (
        input.cardCount > 0 &&
        (current.sourceLanguageTag !== next.sourceLanguageTag ||
            current.targetLanguageTag !== next.targetLanguageTag)
    ) {
        throw new InvalidDictionaryLanguagePairError('locked');
    }

    return next;
}
