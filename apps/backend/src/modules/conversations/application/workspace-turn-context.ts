import { createHash } from 'node:crypto';
import type {
    CopiedAttachment,
    SubmitConversationTurnRequest,
} from '@languon/contracts';
import { ConversationError } from '../domain/conversation';

export type WorkspaceContextLimits = {
    editorCharacters: number;
    referenceCharacters: number;
};

export const defaultWorkspaceContextLimits: WorkspaceContextLimits = {
    editorCharacters: 40_000,
    referenceCharacters: 40_000,
};

const characters = (value: string) => Array.from(value).length;
type EditorAnchor = NonNullable<
    NonNullable<SubmitConversationTurnRequest['editorContext']>['editorTarget']
>;

function validBoundary(content: string, offset: number): boolean {
    if (offset <= 0 || offset >= content.length) return true;
    const previous = content.charCodeAt(offset - 1);
    const next = content.charCodeAt(offset);
    return !(
        previous >= 0xd800 &&
        previous <= 0xdbff &&
        next >= 0xdc00 &&
        next <= 0xdfff
    );
}

function assertEditorAnchor(
    content: string,
    anchor: EditorAnchor,
    mode?: 'insert' | 'append' | 'replace',
) {
    const hash = createHash('sha256').update(content, 'utf8').digest('hex');
    if (
        anchor.documentHash !== hash ||
        anchor.from > anchor.to ||
        anchor.to > content.length ||
        !validBoundary(content, anchor.from) ||
        !validBoundary(content, anchor.to) ||
        content.slice(anchor.from, anchor.to) !== anchor.originalText ||
        (mode === 'replace' && anchor.from === anchor.to) ||
        ((mode === 'insert' || mode === 'append') &&
            (anchor.from !== anchor.to || anchor.originalText !== '')) ||
        (mode === 'append' && anchor.from !== content.length)
    )
        throw new ConversationError(
            'invalid_editor_target',
            'The proposal target changed. Select it again.',
        );
}

export function firstThreeWords(value: string): string {
    const words = value.trim().split(/\s+/u).slice(0, 3).join(' ');
    let title = '';
    for (const character of words) {
        if (title.length + character.length > 200) break;
        title += character;
    }
    return title || 'Language discussion';
}

export function assertWorkspaceTurnContext(
    input: SubmitConversationTurnRequest,
    limits: WorkspaceContextLimits,
): void {
    const editor = input.editorContext;
    if (!editor)
        throw new ConversationError(
            'editor_context_required',
            'Send the complete current editor text with this question.',
        );
    if (characters(editor.content) > limits.editorCharacters)
        throw new ConversationError(
            'editor_context_too_large',
            `The editor exceeds the ${limits.editorCharacters.toLocaleString('en-US')}-character tutor limit. Reduce the editor text before sending.`,
        );
    if (editor.selectedText && !editor.content.includes(editor.selectedText))
        throw new ConversationError(
            'invalid_editor_selection',
            'The selected passage is no longer in the editor. Select it again.',
        );
    assertEditorAnchor(editor.content, editor.editorTarget);
    if (editor.proposalTarget)
        assertEditorAnchor(
            editor.content,
            editor.proposalTarget,
            editor.proposalTarget.mode,
        );
    if (referenceCharacters(input.attachments) > limits.referenceCharacters)
        throw new ConversationError(
            'reference_context_too_large',
            `Reference text exceeds the ${limits.referenceCharacters.toLocaleString('en-US')}-character limit. Remove a reference or select a shorter passage.`,
        );
}

export function referenceCharacters(
    references: readonly CopiedAttachment[],
): number {
    return references.reduce(
        (total, item) =>
            total +
            characters(item.content) +
            (item.kind === 'text-reference' && item.translation
                ? characters(item.translation)
                : 0),
        0,
    );
}
