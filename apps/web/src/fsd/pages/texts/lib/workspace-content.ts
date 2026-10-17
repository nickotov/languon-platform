import type { TextDocument } from '@languon/contracts';
import { sentenceContent } from './workspace-boundaries';

export const WORKSPACE_SOURCE_LIMIT = 20_000;
export type WorkspacePair = {
    pairId: string;
    source: string;
    translation: string;
};
export type WorkspaceInput = {
    title: string;
    sourceLanguage: string;
    targetLanguage: string;
    sourceText: string;
};
export const emptyWorkspaceInput: WorkspaceInput = {
    title: '',
    sourceLanguage: 'auto',
    targetLanguage: '',
    sourceText: '',
};
export function sourceCodePoints(value: string) {
    return Array.from(value).length;
}

export function workspaceValidation(input: WorkspaceInput) {
    const errors: {
        sourceLanguage?: 'sourceRequired';
        targetLanguage?: 'targetRequired' | 'sameLanguages';
        sourceText?: 'textRequired' | 'textTooLong';
    } = {};

    if (!input.sourceLanguage) errors.sourceLanguage = 'sourceRequired';
    if (!input.targetLanguage) errors.targetLanguage = 'targetRequired';
    else if (input.sourceLanguage === input.targetLanguage)
        errors.targetLanguage = 'sameLanguages';

    if (sourceCodePoints(input.sourceText) > WORKSPACE_SOURCE_LIMIT)
        errors.sourceText = 'textTooLong';
    else if (!input.sourceText.trim()) errors.sourceText = 'textRequired';

    return errors;
}

export function workspaceValid(input: WorkspaceInput) {
    return Object.keys(workspaceValidation(input)).length === 0;
}
export function workspacePairs(
    document: Pick<TextDocument, 'alignment'>,
): WorkspacePair[] {
    return (
        document.alignment?.source.map((source, index) => ({
            pairId: source.pairId,
            source: sentenceContent(source.text),
            translation: sentenceContent(
                document.alignment?.translation[index]?.text ?? '',
            ),
        })) ?? []
    );
}
export function workspaceInput(document: TextDocument): WorkspaceInput {
    return {
        title: document.title,
        sourceLanguage: document.sourceLanguage,
        targetLanguage: document.targetLanguage,
        sourceText: document.sourceText,
    };
}
export function workspaceTitle(input: WorkspaceInput) {
    return (
        input.title.trim() ||
        Array.from(
            input.sourceText
                .split(/\r?\n/u)
                .find((line) => line.trim())
                ?.trim() ?? '',
        )
            .slice(0, 160)
            .join('')
    );
}
