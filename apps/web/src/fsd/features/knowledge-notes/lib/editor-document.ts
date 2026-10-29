import type { JSONContent } from '@tiptap/core';
import {
    KnowledgeBodySchema,
    LearningBlockSchema,
    type KnowledgeBody,
    type KnowledgeNode,
} from '@languon/contracts';

/** Tiptap presentation defaults are not part of the stored content contract. */
export function normalizeEditorDocument(document: unknown): KnowledgeBody {
    let count = 0;
    let hasBlocks = false;
    function node(value: unknown, depth = 0): unknown {
        count += 1;
        if (depth > 12 || count > 5_000)
            throw new Error('Explanation is too complex');
        if (!value || typeof value !== 'object' || Array.isArray(value))
            return value;
        const input = value as Record<string, unknown>;
        const attrs =
            input.attrs && typeof input.attrs === 'object'
                ? (input.attrs as Record<string, unknown>)
                : {};
        if (input.type === 'learningBlock') {
            hasBlocks = true;
            if (
                Object.keys(input).some(
                    (key) => !['type', 'attrs'].includes(key),
                )
            )
                throw new Error('Atomic blocks cannot contain inline content');
            if (Object.keys(attrs).some((key) => key !== 'block'))
                throw new Error('Unsupported block attributes');
            return {
                type: 'learningBlock',
                attrs: { block: LearningBlockSchema.parse(attrs.block) },
            };
        }
        let names: string[] = [];
        if (input.type === 'heading') names = ['level'];
        if (input.type === 'orderedList') names = ['start'];
        if (input.type === 'tableCell' || input.type === 'tableHeader')
            names = ['colspan', 'rowspan', 'colwidth'];
        const canonical = Object.fromEntries(
            names
                .filter((key) => attrs[key] !== undefined)
                .map((key) => [key, attrs[key]]),
        );
        return {
            type: input.type,
            ...(input.text === undefined ? {} : { text: input.text }),
            ...(Object.keys(canonical).length ? { attrs: canonical } : {}),
            ...(Array.isArray(input.content)
                ? {
                      content: input.content.map((child) =>
                          node(child, depth + 1),
                      ),
                  }
                : {}),
            ...(Array.isArray(input.marks)
                ? {
                      marks: input.marks.map((value: unknown) => {
                          if (!value || typeof value !== 'object') return value;
                          const mark = value as Record<string, unknown>;
                          const attributes = mark.attrs as
                              Record<string, unknown> | undefined;
                          return mark.type === 'link'
                              ? {
                                    type: 'link',
                                    attrs: { href: attributes?.href },
                                }
                              : { type: mark.type };
                      }),
                  }
                : {}),
        };
    }
    const normalized = node(document);
    return KnowledgeBodySchema.parse({
        schemaVersion: hasBlocks ? 2 : 1,
        document: normalized,
    });
}

/** Strip absent optional fields when crossing the SDK's exact-optional boundary. */
export function toEditorDocument(node: KnowledgeNode): JSONContent {
    return {
        type: node.type,
        ...(node.text !== undefined ? { text: node.text } : {}),
        ...(node.attrs ? { attrs: node.attrs } : {}),
        ...(node.marks
            ? { marks: node.marks.map((mark) => ({ ...mark })) }
            : {}),
        ...(node.content
            ? { content: node.content.map(toEditorDocument) }
            : {}),
    };
}
