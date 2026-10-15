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
    sourceLanguage: '',
    targetLanguage: '',
    sourceText: '',
};
export function sourceCodePoints(value: string) {
    return Array.from(value).length;
}
export function workspaceValid(input: WorkspaceInput) {
    return Boolean(
        input.sourceLanguage &&
        input.targetLanguage &&
        input.sourceLanguage !== input.targetLanguage &&
        input.sourceText.trim() &&
        sourceCodePoints(input.sourceText) <= WORKSPACE_SOURCE_LIMIT,
    );
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
