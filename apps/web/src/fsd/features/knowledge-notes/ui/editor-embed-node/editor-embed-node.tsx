import { Node } from '@tiptap/core';
import {
    NodeViewWrapper,
    ReactNodeViewRenderer,
    type NodeViewProps,
} from '@tiptap/react';
import { KnowledgeEmbedNodeSchema } from '@languon/contracts';
import { KnowledgeEmbed } from '@/fsd/entities/knowledge';

// A separate content group prevents list items, table cells and quotes from
// accepting a preview when the surrounding text is wrapped, moved or pasted.
export const KnowledgeEditorDocument = Node.create({
    name: 'doc',
    topNode: true,
    content: '(block | linkedMedia)+',
});

function EmbedNodeView({ node }: NodeViewProps) {
    const embed = KnowledgeEmbedNodeSchema.safeParse(node.toJSON());

    return (
        <NodeViewWrapper contentEditable={false}>
            {embed.success && (
                <KnowledgeEmbed
                    type={embed.data.type}
                    src={embed.data.attrs.src}
                />
            )}
        </NodeViewWrapper>
    );
}

function createEmbedNode(name: 'websiteEmbed' | 'imageEmbed') {
    return Node.create({
        name,
        group: 'linkedMedia',
        atom: true,
        selectable: true,
        isolating: true,
        addAttributes() {
            // The rule below supplies the validated data-src; generic attribute
            // parsing must not override it from a second HTML attribute.
            return {
                src: { default: null, rendered: false, parseHTML: () => null },
            };
        },
        parseHTML() {
            // Only recognize our serialized node, never third-party iframe HTML.
            return [
                {
                    tag: `div[data-knowledge-embed="${name}"]`,
                    getAttrs(element) {
                        const src = element.getAttribute('data-src');
                        const parsed = KnowledgeEmbedNodeSchema.safeParse({
                            type: name,
                            attrs: { src },
                        });

                        return parsed.success ? parsed.data.attrs : false;
                    },
                },
            ];
        },
        renderHTML({ node }) {
            const embed = KnowledgeEmbedNodeSchema.parse(node.toJSON());

            return [
                'div',
                { 'data-knowledge-embed': name, 'data-src': embed.attrs.src },
                embed.attrs.src,
            ];
        },
        addNodeView() {
            return ReactNodeViewRenderer(EmbedNodeView);
        },
    });
}

export const WebsiteEmbedNode = createEmbedNode('websiteEmbed');
export const ImageEmbedNode = createEmbedNode('imageEmbed');
