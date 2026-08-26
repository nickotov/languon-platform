import { dictionaryLimits, normalizeOptionalText } from './limits';

export type DictionaryEnablement = 'disabled' | 'enabled';
export type DictionaryLanguageRole = 'source' | 'target';
export type TranscriptionNotation = 'custom' | 'ipa' | 'romanization';

export interface DictionarySettings {
    customNotationLabel: string | null;
    definitionEnabled: boolean;
    definitionLanguageRole: DictionaryLanguageRole;
    exampleEnabled: boolean;
    exampleLanguageRole: DictionaryLanguageRole;
    exampleTranslationEnabled: boolean;
    transcriptionEnabled: boolean;
    transcriptionNotation: TranscriptionNotation;
    version: number;
}

export interface CardSettingsOverrides {
    customNotationLabel: string | null;
    definitionEnabled: DictionaryEnablement | null;
    definitionLanguageRole: DictionaryLanguageRole | null;
    exampleEnabled: DictionaryEnablement | null;
    exampleLanguageRole: DictionaryLanguageRole | null;
    exampleTranslationEnabled: DictionaryEnablement | null;
    transcriptionEnabled: DictionaryEnablement | null;
    transcriptionNotation: TranscriptionNotation | null;
}

export interface EffectiveCardSettings {
    customNotationLabel: string | null;
    definitionEnabled: boolean;
    definitionLanguageRole: DictionaryLanguageRole;
    exampleEnabled: boolean;
    exampleLanguageRole: DictionaryLanguageRole;
    exampleTranslationEnabled: boolean;
    exampleTranslationLanguageRole: DictionaryLanguageRole;
    transcriptionEnabled: boolean;
    transcriptionNotation: TranscriptionNotation;
}

export class InvalidDictionarySettingsError extends Error {
    public constructor(
        public readonly reason:
            | 'custom_label_required'
            | 'example_translation_requires_example'
            | 'invalid_version',
    ) {
        super(`The dictionary settings are invalid (${reason}).`);
        this.name = 'InvalidDictionarySettingsError';
    }
}

export const defaultDictionarySettings: Readonly<DictionarySettings> =
    Object.freeze({
        customNotationLabel: null,
        definitionEnabled: false,
        definitionLanguageRole: 'source',
        exampleEnabled: true,
        exampleLanguageRole: 'source',
        exampleTranslationEnabled: true,
        transcriptionEnabled: false,
        transcriptionNotation: 'ipa',
        version: 1,
    });

export const inheritedCardSettingsOverrides: Readonly<CardSettingsOverrides> =
    Object.freeze({
        customNotationLabel: null,
        definitionEnabled: null,
        definitionLanguageRole: null,
        exampleEnabled: null,
        exampleLanguageRole: null,
        exampleTranslationEnabled: null,
        transcriptionEnabled: null,
        transcriptionNotation: null,
    });

const isEnabled = (value: DictionaryEnablement | null, fallback: boolean) =>
    value === null ? fallback : value === 'enabled';

const oppositeRole = (role: DictionaryLanguageRole): DictionaryLanguageRole =>
    role === 'source' ? 'target' : 'source';

function normalizeCustomLabel(value: string | null): string | null {
    return normalizeOptionalText(value, {
        field: 'custom_notation_label',
        maximumCodePoints: dictionaryLimits.customNotationLabelCodePoints,
    });
}

export function validateDictionarySettings(
    input: DictionarySettings,
): DictionarySettings {
    if (!Number.isSafeInteger(input.version) || input.version < 1) {
        throw new InvalidDictionarySettingsError('invalid_version');
    }

    const customNotationLabel = normalizeCustomLabel(input.customNotationLabel);

    if (
        input.transcriptionEnabled &&
        input.transcriptionNotation === 'custom' &&
        customNotationLabel === null
    ) {
        throw new InvalidDictionarySettingsError('custom_label_required');
    }

    return { ...input, customNotationLabel };
}

export function normalizeCardSettingsOverrides(
    input: CardSettingsOverrides,
): CardSettingsOverrides {
    return {
        ...input,
        customNotationLabel: normalizeCustomLabel(input.customNotationLabel),
    };
}

export function resolveCardSettings(input: {
    dictionary: DictionarySettings;
    overrides: CardSettingsOverrides;
}): EffectiveCardSettings {
    const dictionary = validateDictionarySettings(input.dictionary);
    const overrides = normalizeCardSettingsOverrides(input.overrides);
    const exampleEnabled = isEnabled(
        overrides.exampleEnabled,
        dictionary.exampleEnabled,
    );
    const exampleTranslationResolved = isEnabled(
        overrides.exampleTranslationEnabled,
        dictionary.exampleTranslationEnabled,
    );
    const exampleLanguageRole =
        overrides.exampleLanguageRole ?? dictionary.exampleLanguageRole;
    const transcriptionEnabled = isEnabled(
        overrides.transcriptionEnabled,
        dictionary.transcriptionEnabled,
    );
    const transcriptionNotation =
        overrides.transcriptionNotation ?? dictionary.transcriptionNotation;
    const customNotationLabel =
        overrides.customNotationLabel ?? dictionary.customNotationLabel;

    if (
        transcriptionEnabled &&
        transcriptionNotation === 'custom' &&
        customNotationLabel === null
    ) {
        throw new InvalidDictionarySettingsError('custom_label_required');
    }

    return {
        customNotationLabel,
        definitionEnabled: isEnabled(
            overrides.definitionEnabled,
            dictionary.definitionEnabled,
        ),
        definitionLanguageRole:
            overrides.definitionLanguageRole ??
            dictionary.definitionLanguageRole,
        exampleEnabled,
        exampleLanguageRole,
        exampleTranslationEnabled: exampleEnabled && exampleTranslationResolved,
        exampleTranslationLanguageRole: oppositeRole(exampleLanguageRole),
        transcriptionEnabled,
        transcriptionNotation,
    };
}

export function assertCardSettingsOverrideTransition(input: {
    dictionary: DictionarySettings;
    next: CardSettingsOverrides;
    previous: CardSettingsOverrides | null;
}): void {
    const next = normalizeCardSettingsOverrides(input.next);
    const previous = input.previous
        ? normalizeCardSettingsOverrides(input.previous)
        : inheritedCardSettingsOverrides;
    const effectiveExampleEnabled = isEnabled(
        next.exampleEnabled,
        input.dictionary.exampleEnabled,
    );

    if (
        previous.exampleTranslationEnabled !== 'enabled' &&
        next.exampleTranslationEnabled === 'enabled' &&
        !effectiveExampleEnabled
    ) {
        throw new InvalidDictionarySettingsError(
            'example_translation_requires_example',
        );
    }

    resolveCardSettings({ dictionary: input.dictionary, overrides: next });
}

export function assertDictionarySettingsTransition(input: {
    next: DictionarySettings;
    previous: DictionarySettings;
}): void {
    const next = validateDictionarySettings(input.next);

    if (
        !input.previous.exampleTranslationEnabled &&
        next.exampleTranslationEnabled &&
        !next.exampleEnabled
    ) {
        throw new InvalidDictionarySettingsError(
            'example_translation_requires_example',
        );
    }
}
