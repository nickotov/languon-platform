import { Node, mergeAttributes } from '@tiptap/core';
import type { NodeView } from '@tiptap/pm/view';
import type { ExerciseActivityId } from '@languon/contracts';

export const PromptMention = Node.create<{
    onPreview?: (id: ExerciseActivityId) => void;
    removeLabel: string;
    missingLabel: string;
}>({
    addOptions() {
        return { removeLabel: 'Remove', missingLabel: 'Source unavailable' };
    },
    addNodeView() {
        return ({ node: initial, getPos, editor }) => {
            let node = initial;
            const dom = document.createElement('span');
            dom.contentEditable = 'false';
            const label = document.createElement(
                node.attrs.kind === 'exercise' ? 'button' : 'span',
            );
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.textContent = '×';
            if (label instanceof HTMLButtonElement) {
                label.type = 'button';
                label.addEventListener('click', () =>
                    this.options.onPreview?.(node.attrs.activityId),
                );
            }

            remove.addEventListener('click', () => {
                const position = getPos();
                if (typeof position === 'number') {
                    editor
                        .chain()
                        .focus()
                        .deleteRange({
                            from: position,
                            to: position + node.nodeSize,
                        })
                        .run();
                }
            });

            dom.append(label, remove);
            const render = () => {
                dom.dataset.promptMention = node.attrs.kind;
                const missing = node.attrs.missing
                    ? ` · ${this.options.missingLabel}`
                    : '';

                label.textContent = `${node.attrs.kind === 'exercise' ? '▤' : '▧'} ${node.attrs.label}${missing}`;
                if (label instanceof HTMLButtonElement) {
                    label.setAttribute(
                        'aria-label',
                        `Preview exercise: ${node.attrs.label}`,
                    );
                }

                remove.setAttribute(
                    'aria-label',
                    `${this.options.removeLabel}: ${node.attrs.label}`,
                );
            };

            render();
            const view: NodeView = {
                dom,
                update: (next) => {
                    if (
                        next.type !== node.type ||
                        next.attrs.kind !== node.attrs.kind
                    ) {
                        return false;
                    }

                    node = next;
                    render();

                    return true;
                },
                stopEvent: (event) =>
                    event.target instanceof Element &&
                    Boolean(event.target.closest('button')),
                ignoreMutation: () => true,
            };

            return view;
        };
    },
    name: 'promptMention',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    addAttributes() {
        return Object.fromEntries(
            [
                'kind',
                'activityId',
                'catalogVersion',
                'blockId',
                'label',
                'missing',
                'selectionOwner',
            ].map((name) => [name, { default: null }]),
        );
    },
    // Clipboard HTML is deliberately not parsed into privileged reference nodes.
    renderHTML({ node, HTMLAttributes }) {
        const icon = node.attrs.kind === 'exercise' ? '▤ ' : '▧ ';

        return [
            'span',
            mergeAttributes(HTMLAttributes, {
                'data-prompt-mention': node.attrs.kind,
                contenteditable: 'false',
                title: node.attrs.label,
            }),
            `${icon}${node.attrs.label}`,
        ];
    },
    renderText({ node }) {
        return node.attrs.label;
    },
});
