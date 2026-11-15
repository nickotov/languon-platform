import type { Editor, JSONContent } from '@tiptap/core';
import type { PromptValue } from './prompt-document';

/** Replace selected nodes in one transaction so observers never see mixed choices. */
export function replacePromptSelection(
    editor: Editor,
    nodes: JSONContent[],
    predicate: (attrs: Record<string, unknown>) => boolean,
) {
    const positions: { from: number; to: number }[] = [];
    editor.state.doc.descendants((node, from) => {
        if (node.type.name === 'promptMention' && predicate(node.attrs)) {
            positions.push({
                from:
                    from > 0 &&
                    editor.state.doc.textBetween(from - 1, from) === ' '
                        ? from - 1
                        : from,
                to: from + node.nodeSize,
            });
        }
    });

    const transaction = editor.state.tr.setMeta('promptSync', true);
    for (const position of positions.reverse()) {
        transaction.delete(position.from, position.to);
    }

    if (nodes.length) {
        transaction.insert(
            transaction.doc.content.size - 1,
            editor.schema.nodeFromJSON({ type: 'paragraph', content: nodes })
                .content,
        );
    }

    if (transaction.docChanged) {
        editor.view.dispatch(transaction);
    }
}

/** Generated instructions are owned text; replacing them must also map mention ranges. */
export function replacePreparedInstruction(
    value: PromptValue,
    previous: string | null,
    next: string,
): PromptValue {
    const suffix = previous ? `\n\n${previous}` : null;
    let start = -1;
    if (previous && value.content === previous) {
        start = 0;
    } else if (suffix && value.content.endsWith(suffix)) {
        start = value.content.length - previous!.length;
    }

    if (start < 0) {
        return {
            ...value,
            content: value.content.trim()
                ? `${value.content.trimEnd()}\n\n${next}`
                : next,
        };
    }

    const end = start + previous!.length;
    const delta = next.length - previous!.length;

    return {
        content: `${value.content.slice(0, start)}${next}${value.content.slice(end)}`,
        promptMentions: value.promptMentions.flatMap((mention) => {
            if (mention.end <= start) {
                return [mention];
            }

            if (mention.start >= end) {
                return [
                    {
                        ...mention,
                        start: mention.start + delta,
                        end: mention.end + delta,
                    },
                ];
            }

            return [];
        }),
    };
}

/** Advanced choices replace the shared token set while retaining the user's prose. */
export function stripPromptSelections(value: PromptValue): PromptValue {
    let content = value.content;
    for (const mention of [...value.promptMentions].reverse()) {
        const start =
            mention.start > 0 && content[mention.start - 1] === ' '
                ? mention.start - 1
                : mention.start;

        content = content.slice(0, start) + content.slice(mention.end);
    }

    return { content: content.trimEnd(), promptMentions: [] };
}
