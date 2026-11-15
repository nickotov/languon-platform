import type { JSONContent } from '@tiptap/core';
import type { ConversationPromptMention } from '@languon/contracts';

export type PromptValue = {
    content: string;
    promptMentions: ConversationPromptMention[];
    synchronize?: boolean;
};

/** Labels are visible text only; typed identities carry the separate selection. */
export function promptDocument(
    content: string,
    mentions: ConversationPromptMention[],
    previous?: JSONContent,
): JSONContent {
    const nodes: JSONContent[] = [];
    const owners = new Map<string, unknown[]>();
    function remember(node: JSONContent) {
        if (node.type === 'promptMention' && node.attrs) {
            const key = `${node.attrs.kind}:${node.attrs.activityId ?? node.attrs.blockId}`;
            owners.set(key, [
                ...(owners.get(key) ?? []),
                node.attrs.selectionOwner,
            ]);
        }

        node.content?.forEach(remember);
    }

    if (previous) {
        remember(previous);
    }

    let cursor = 0;
    for (const mention of mentions) {
        if (mention.start < cursor || mention.end > content.length) {
            continue;
        }

        if (mention.start > cursor) {
            nodes.push({
                type: 'text',
                text: content.slice(cursor, mention.start),
            });
        }

        nodes.push({
            type: 'promptMention',
            attrs: {
                ...mention,
                selectionOwner:
                    owners
                        .get(
                            `${mention.kind}:${mention.kind === 'exercise' ? mention.activityId : mention.blockId}`,
                        )
                        ?.shift() ?? null,
                label: content.slice(mention.start, mention.end),
            },
        });

        cursor = mention.end;
    }

    if (cursor < content.length) {
        nodes.push({ type: 'text', text: content.slice(cursor) });
    }

    return { type: 'doc', content: [{ type: 'paragraph', content: nodes }] };
}

export function serializePrompt(document: JSONContent): PromptValue {
    let content = '';
    const mentions: ConversationPromptMention[] = [];
    function visit(node: JSONContent) {
        if (node.type === 'text') {
            content += node.text ?? '';
        } else if (node.type === 'hardBreak') {
            content += '\n';
        } else if (node.type === 'promptMention' && node.attrs) {
            const start = content.length;
            content += String(node.attrs.label ?? '');
            const base = { start, end: content.length };
            if (node.attrs.kind === 'exercise') {
                mentions.push({
                    ...base,
                    kind: 'exercise',
                    activityId: node.attrs.activityId,
                    catalogVersion: 1,
                });
            } else {
                mentions.push({
                    ...base,
                    kind: 'block',
                    blockId: node.attrs.blockId,
                });
            }
        } else {
            node.content?.forEach((child, index) => {
                if (node.type === 'doc' && index > 0) {
                    content += '\n';
                }

                visit(child);
            });
        }
    }

    visit(document);
    const leading = content.length - content.trimStart().length;
    const trimmed = content.trim();

    return {
        content: trimmed,
        promptMentions: mentions.map((item) => ({
            ...item,
            start: item.start - leading,
            end: item.end - leading,
        })),
    };
}
