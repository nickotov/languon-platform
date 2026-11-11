import {
    DictionaryChatGenerationContextSchema,
    DictionaryChatSnippetInputSchema,
    type DictionaryChatGenerationContext,
    type DictionaryChatSnippetInput,
} from '@languon/contracts';
import { normalizeCardValues } from '../../dictionaries/domain/limits';

/** Frozen authoring settings determine completeness; later application uses current write rules. */
export function validateDictionaryChatSnippet(
    input: DictionaryChatSnippetInput,
    generationContext: DictionaryChatGenerationContext,
): DictionaryChatSnippetInput {
    const parsed = DictionaryChatSnippetInputSchema.parse(input);
    const { settings } =
        DictionaryChatGenerationContextSchema.parse(generationContext);
    const cards = parsed.cards.map(normalizeCardValues);
    for (const card of cards) {
        const incomplete =
            (settings.definitionEnabled && !card.definition) ||
            (settings.transcriptionEnabled && !card.transcription) ||
            (settings.exampleEnabled && !card.example) ||
            (settings.exampleEnabled &&
                settings.exampleTranslationEnabled &&
                !card.exampleTranslation);

        if (incomplete) {
            throw new Error(
                'A dictionary snippet must include every enabled field.',
            );
        }
    }

    return { ...parsed, cards };
}
