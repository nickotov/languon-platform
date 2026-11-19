import { z } from 'zod';
import type { KnowledgeBody, KnowledgeNode } from '@languon/contracts';

const literalText = z.string().trim().min(1).max(80_000);
const listItems = z.array(literalText).min(1).max(500);

/** The model writes language content; the host owns all editor structure and attributes. */
export const generatedReadingSchema = z
    .array(
        z.discriminatedUnion('kind', [
            z.strictObject({ kind: z.literal('paragraph'), text: literalText }),
            z.strictObject({
                kind: z.literal('heading'),
                level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
                text: literalText,
            }),
            z.strictObject({ kind: z.literal('bulletList'), items: listItems }),
            z.strictObject({
                kind: z.literal('orderedList'),
                items: listItems,
            }),
        ]),
    )
    .min(1)
    .max(500);

export type GeneratedReading = z.infer<typeof generatedReadingSchema>;

function paragraph(text: string): KnowledgeNode {
    return { type: 'paragraph', content: [{ type: 'text', text }] };
}

/** Callers validate this body with the full canonical document limits before checkpointing. */
export function compileGeneratedReading(
    sections: GeneratedReading,
): KnowledgeBody {
    const content = sections.map((section): KnowledgeNode => {
        switch (section.kind) {
            case 'paragraph':
                return paragraph(section.text);
            case 'heading':
                return {
                    type: 'heading',
                    attrs: { level: section.level },
                    content: [{ type: 'text', text: section.text }],
                };
            case 'bulletList':
            case 'orderedList':
                return {
                    type: section.kind,
                    content: section.items.map((item) => ({
                        type: 'listItem',
                        content: [paragraph(item)],
                    })),
                };
        }
    });

    return { schemaVersion: 2, document: { type: 'doc', content } };
}

/** Stable learner-visible projection: marks do not insert separators within a paragraph. */
export function learningContentProseText(body: KnowledgeBody): string {
    const text = (node: KnowledgeBody['document']): string => {
        if (node.type === 'text') {
            return node.text ?? '';
        }

        if (node.type === 'hardBreak') {
            return '\n';
        }

        const separator =
            node.type === 'paragraph' || node.type === 'heading' ? '' : '\n';

        return (node.content ?? []).map(text).join(separator);
    };

    return text(body.document);
}
