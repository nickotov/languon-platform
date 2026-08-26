export const dictionaryLimits = {
    cardCapacity: 10_000,
    customNotationLabelCodePoints: 40,
    descriptionCodePoints: 2_000,
    nameCodePoints: 120,
    ownerDictionaryCapacity: 100,
    ownerRetainedCardCapacity: 50_000,
    ownerRevisionCapacity: 250_000,
    optionalLongValueCodePoints: 2_000,
    optionalShortValueCodePoints: 200,
    requiredCardValueCodePoints: 200,
} as const;

export class DictionaryOwnerCapacityError extends Error {
    public constructor(public readonly resource: 'cards' | 'dictionaries') {
        super(`The owner ${resource} capacity was reached.`);
        this.name = 'DictionaryOwnerCapacityError';
    }
}

export interface DictionaryOwnerLimits {
    ownerDictionaryCapacity: number;
    ownerRetainedCardCapacity: number;
    ownerRevisionCapacity: number;
}

export function assertDictionaryOwnerCapacity(
    retained: { cards: number; dictionaries: number; revisions: number },
    additional: { cards: number; dictionaries: number; revisions: number },
    limits: DictionaryOwnerLimits = dictionaryLimits,
): void {
    if (
        retained.dictionaries + additional.dictionaries >
        limits.ownerDictionaryCapacity
    ) {
        throw new DictionaryOwnerCapacityError('dictionaries');
    }
    if (
        retained.cards + additional.cards > limits.ownerRetainedCardCapacity ||
        retained.revisions + additional.revisions > limits.ownerRevisionCapacity
    ) {
        throw new DictionaryOwnerCapacityError('cards');
    }
}

export type DictionaryTextField =
    | 'custom_notation_label'
    | 'description'
    | 'dictionary_name'
    | 'example'
    | 'example_translation'
    | 'definition'
    | 'source'
    | 'transcription'
    | 'translation';

export type InvalidDictionaryTextReason =
    'blank' | 'control_character' | 'too_long';

export class InvalidDictionaryTextError extends Error {
    public constructor(
        public readonly field: DictionaryTextField,
        public readonly reason: InvalidDictionaryTextReason,
    ) {
        super(`The dictionary ${field} value is invalid (${reason}).`);
        this.name = 'InvalidDictionaryTextError';
    }
}

function hasDisallowedControlCharacter(value: string): boolean {
    return [...value].some((character) => {
        const codePoint = character.codePointAt(0)!;

        return (
            codePoint <= 8 ||
            codePoint === 11 ||
            codePoint === 12 ||
            (codePoint >= 14 && codePoint <= 31) ||
            (codePoint >= 127 && codePoint <= 159)
        );
    });
}

function normalizeText(input: string, field: DictionaryTextField): string {
    const value = input.trim();

    if (hasDisallowedControlCharacter(value)) {
        throw new InvalidDictionaryTextError(field, 'control_character');
    }

    return value;
}

export function normalizeRequiredText(
    input: string,
    inputRules: {
        field: DictionaryTextField;
        maximumCodePoints: number;
    },
): string {
    const value = normalizeText(input, inputRules.field);

    if (value.length === 0) {
        throw new InvalidDictionaryTextError(inputRules.field, 'blank');
    }
    if ([...value].length > inputRules.maximumCodePoints) {
        throw new InvalidDictionaryTextError(inputRules.field, 'too_long');
    }

    return value;
}

export function normalizeDictionaryCardSourceForSearch(input: string): string {
    return normalizeRequiredText(input, {
        field: 'source',
        maximumCodePoints: dictionaryLimits.requiredCardValueCodePoints,
    })
        .normalize('NFKC')
        .toLocaleLowerCase('und');
}

export function normalizeOptionalText(
    input: string | null,
    inputRules: {
        field: DictionaryTextField;
        maximumCodePoints: number;
    },
): string | null {
    if (input === null) {
        return null;
    }

    const value = normalizeText(input, inputRules.field);

    if ([...value].length > inputRules.maximumCodePoints) {
        throw new InvalidDictionaryTextError(inputRules.field, 'too_long');
    }

    return value.length === 0 ? null : value;
}

export interface DictionaryCardValues {
    definition: string | null;
    example: string | null;
    exampleTranslation: string | null;
    source: string;
    transcription: string | null;
    translation: string;
}

export interface DictionaryDetails {
    description: string | null;
    name: string;
}

export function normalizeDictionaryDetails(
    input: DictionaryDetails,
): DictionaryDetails {
    return {
        description: normalizeOptionalText(input.description, {
            field: 'description',
            maximumCodePoints: dictionaryLimits.descriptionCodePoints,
        }),
        name: normalizeRequiredText(input.name, {
            field: 'dictionary_name',
            maximumCodePoints: dictionaryLimits.nameCodePoints,
        }),
    };
}

export function normalizeCardValues(
    input: DictionaryCardValues,
): DictionaryCardValues {
    return {
        definition: normalizeOptionalText(input.definition, {
            field: 'definition',
            maximumCodePoints: dictionaryLimits.optionalLongValueCodePoints,
        }),
        example: normalizeOptionalText(input.example, {
            field: 'example',
            maximumCodePoints: dictionaryLimits.optionalLongValueCodePoints,
        }),
        exampleTranslation: normalizeOptionalText(input.exampleTranslation, {
            field: 'example_translation',
            maximumCodePoints: dictionaryLimits.optionalLongValueCodePoints,
        }),
        source: normalizeRequiredText(input.source, {
            field: 'source',
            maximumCodePoints: dictionaryLimits.requiredCardValueCodePoints,
        }),
        transcription: normalizeOptionalText(input.transcription, {
            field: 'transcription',
            maximumCodePoints: dictionaryLimits.optionalShortValueCodePoints,
        }),
        translation: normalizeRequiredText(input.translation, {
            field: 'translation',
            maximumCodePoints: dictionaryLimits.requiredCardValueCodePoints,
        }),
    };
}
