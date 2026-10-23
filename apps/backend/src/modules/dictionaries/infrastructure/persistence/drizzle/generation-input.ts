import {
    dictionarySingleCardGenerationFormats,
    type DictionaryGenerationInputPayload,
} from '../../../domain/generation';

type SingleCardGenerationInput = Extract<
    DictionaryGenerationInputPayload,
    { format: (typeof dictionarySingleCardGenerationFormats)[number] }
>;

export function isSingleCardGenerationInput(
    input: DictionaryGenerationInputPayload | null,
): input is SingleCardGenerationInput {
    return Boolean(
        input &&
        (dictionarySingleCardGenerationFormats as readonly string[]).includes(
            input.format,
        ),
    );
}

export const inputHasFormat = <
    const TFormats extends
        readonly DictionaryGenerationInputPayload['format'][],
>(
    input: DictionaryGenerationInputPayload,
    formats: TFormats,
): input is Extract<
    DictionaryGenerationInputPayload,
    { format: TFormats[number] }
> => formats.some((format) => format === input.format);
