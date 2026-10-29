import { TextLanguageSchema, type LearningBlock } from '@languon/contracts';
/** Prefer the familiar reading defaults, then the rest of the supported catalog. */
export function eligiblePrivateTranslationTargets(
    block: Extract<LearningBlock, { type: 'bilingual-text' }>,
) {
    const existing = new Set(
        [
            block.language,
            ...block.translations.map((translation) => translation.language),
        ].map((language) => language.toLowerCase()),
    );
    const candidates = [
        ...new Set([
            'fr' as const,
            'en' as const,
            ...TextLanguageSchema.options,
        ]),
    ];
    return candidates.filter(
        (language) => !existing.has(language.toLowerCase()),
    );
}
