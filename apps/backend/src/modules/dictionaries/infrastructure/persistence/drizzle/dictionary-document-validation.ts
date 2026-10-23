import { documentIngestionLimitsV1 } from '../../../domain/document-ingestion';
import { resolveCardSettings } from '../../../domain/settings';
import type { dictionarySettingsTable } from './schema';

export function abort(signal: AbortSignal): void {
    signal.throwIfAborted();
}

export function validScanAttestation(input: {
    completedAt: Date;
    engineVersion: string;
    signatureUpdatedAt: Date;
    signatureVersion: string;
}): boolean {
    return (
        input.engineVersion.trim().length > 0 &&
        input.engineVersion.length <= 128 &&
        input.signatureVersion.trim().length > 0 &&
        input.signatureVersion.length <= 128 &&
        input.signatureUpdatedAt <= input.completedAt &&
        input.completedAt.getTime() - input.signatureUpdatedAt.getTime() <=
            documentIngestionLimitsV1.scanner.maximumSignatureAgeMs
    );
}

export function effectiveSettings(
    row: typeof dictionarySettingsTable.$inferSelect,
) {
    const resolved = resolveCardSettings({
        dictionary: {
            customNotationLabel: row.customNotationLabel,
            definitionEnabled: row.definitionEnabled,
            definitionLanguageRole: row.definitionLanguageRole,
            exampleEnabled: row.exampleEnabled,
            exampleLanguageRole: row.exampleLanguageRole,
            exampleTranslationEnabled: row.exampleTranslationEnabled,
            transcriptionEnabled: row.transcriptionEnabled,
            transcriptionNotation: row.transcriptionNotation,
            version: row.version,
        },
        overrides: {
            customNotationLabel: null,
            definitionEnabled: null,
            definitionLanguageRole: null,
            exampleEnabled: null,
            exampleLanguageRole: null,
            exampleTranslationEnabled: null,
            transcriptionEnabled: null,
            transcriptionNotation: null,
        },
    });

    return {
        definitionEnabled: resolved.definitionEnabled,
        definitionLanguage: resolved.definitionLanguageRole,
        exampleEnabled: resolved.exampleEnabled,
        exampleLanguage: resolved.exampleLanguageRole,
        exampleTranslationEnabled: resolved.exampleTranslationEnabled,
        exampleTranslationLanguage: resolved.exampleTranslationLanguageRole,
        transcriptionCustomLabel: resolved.customNotationLabel,
        transcriptionEnabled: resolved.transcriptionEnabled,
        transcriptionNotation: resolved.transcriptionNotation,
    };
}
