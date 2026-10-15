import type { TextDocument } from '@languon/contracts';
import type { WorkspacePair } from './workspace-content';

function sentenceBoundary(text: string) {
    const leading = text.match(/^\s*/u)?.[0] ?? '';
    const content = text.slice(leading.length);
    const trailing = content.match(/\s*$/u)?.[0] ?? '';
    return {
        leading,
        content: content.slice(0, content.length - trailing.length),
        trailing,
    };
}
export function sentenceContent(text: string) {
    return sentenceBoundary(text).content;
}

// The alignment owns separators. Textareas edit sentence content, so replacing
// their value must not remove paragraph breaks or spaces between sentence pairs.
export function workspaceEdits(
    document: Pick<TextDocument, 'alignment'>,
    pairs: WorkspacePair[],
): WorkspacePair[] {
    const source = new Map(
        document.alignment?.source.map((segment) => [
            segment.pairId,
            sentenceBoundary(segment.text),
        ]),
    );
    const translation = new Map(
        document.alignment?.translation.map((segment) => [
            segment.pairId,
            sentenceBoundary(segment.text),
        ]),
    );
    return pairs.map((pair) => ({
        pairId: pair.pairId,
        source:
            (source.get(pair.pairId)?.leading ?? '') +
            pair.source +
            (source.get(pair.pairId)?.trailing ?? ''),
        translation:
            (translation.get(pair.pairId)?.leading ?? '') +
            pair.translation +
            (translation.get(pair.pairId)?.trailing ?? ''),
    }));
}
