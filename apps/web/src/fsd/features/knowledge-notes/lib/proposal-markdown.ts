import type { JSONContent } from '@tiptap/core';
import { TableKit } from '@tiptap/extension-table';
import { MarkdownManager } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { KnowledgeLinkSchema } from '@languon/contracts';
import { normalizeEditorDocument, toEditorDocument } from './editor-document';

export class ProposalMarkdownError extends Error {
    constructor(
        public readonly code:
            'unsupported' | 'unsafe-link' | 'invalid' | 'limit',
    ) {
        super(`Cannot insert this proposal as rich text: ${code}.`);
        this.name = 'ProposalMarkdownError';
    }
}

const manager = new MarkdownManager({
    extensions: [
        StarterKit.configure({
            // Parse every heading level before mapping to our persisted schema.
            heading: { levels: [1, 2, 3, 4, 5, 6] },
            codeBlock: false,
            horizontalRule: false,
            link: { autolink: false, linkOnPaste: false },
        }),
        TableKit.configure({ table: { resizable: false } }),
    ],
    markedOptions: { gfm: true, breaks: false },
});

type Token = {
    type: string;
    text?: string;
    raw?: string;
    href?: string;
    title?: string | null;
    task?: boolean;
    align?: (string | null)[];
    tokens?: Token[];
    items?: Token[];
    header?: { tokens: Token[] }[];
    rows?: { tokens: Token[] }[][];
};

const supportedTokens = new Set([
    'space',
    'paragraph',
    'heading',
    'text',
    'escape',
    'strong',
    'em',
    'del',
    'codespan',
    'link',
    'def',
    'br',
    'list',
    'list_item',
    'blockquote',
    'table',
]);

function checkInput(text: string) {
    if (text.length > 80_000) throw new ProposalMarkdownError('limit');
    if (
        !text.trim() ||
        /[\uD800-\uDFFF]/u.test(text) ||
        text.includes('\u0000')
    )
        throw new ProposalMarkdownError('invalid');
}

function tableRowWidth(line: string): number {
    const row = line.trim();
    let separators = 0;
    let escaped = false;
    let endsWithSeparator = false;
    for (const character of row) {
        endsWithSeparator = character === '|' && !escaped;
        if (endsWithSeparator) separators += 1;
        escaped = character === '\\' ? !escaped : false;
    }
    return (
        separators + 1 - Number(row.startsWith('|')) - Number(endsWithSeparator)
    );
}

function preflight(text: string) {
    // Bound obvious block nesting before the recursive upstream lexer runs.
    for (const line of text.split('\n')) {
        let quotes = 0;
        for (const character of line) {
            if (character === '>') {
                if (++quotes > 12) throw new ProposalMarkdownError('limit');
            } else if (character !== ' ' && character !== '\t') break;
        }
    }
    const tokens = manager.instance.lexer(text) as unknown as Token[];
    const pending = tokens.map((token) => ({ token, depth: 0 }));
    let count = 0;
    let formattingAdjusted = false;
    const definitions = new Set<string>();
    const linkedDestinations = new Set<string>();
    while (pending.length) {
        const { token, depth } = pending.pop()!;
        if (++count > 5_000 || depth > 24)
            throw new ProposalMarkdownError('limit');
        if (!supportedTokens.has(token.type) || token.task)
            throw new ProposalMarkdownError('unsupported');
        if (['heading', 'link'].includes(token.type) && !token.text?.trim())
            throw new ProposalMarkdownError('unsupported');
        if (
            ['link', 'def'].includes(token.type) &&
            !KnowledgeLinkSchema.safeParse(token.href).success
        )
            throw new ProposalMarkdownError('unsafe-link');
        if (token.type === 'def' && token.href) definitions.add(token.href);
        if (token.type === 'link' && token.href)
            linkedDestinations.add(token.href);
        if (token.type === 'link' && token.title) formattingAdjusted = true;
        if (token.type === 'table') {
            formattingAdjusted ||= token.align?.some(Boolean) ?? false;
            const width = token.header?.length ?? 0;
            if (width > 8 || (token.rows?.length ?? 0) > 19)
                throw new ProposalMarkdownError('limit');
            // Marked truncates surplus cells and pads missing cells during lexing.
            // Check the original rows so text cannot disappear before validation.
            const rows = (token.raw ?? '').trimEnd().split('\n');
            if (rows.some((row) => tableRowWidth(row) !== width))
                throw new ProposalMarkdownError('unsupported');
        }
        const children = [
            ...(token.tokens ?? []),
            ...(token.items ?? []),
            ...(token.header ?? []).flatMap((cell) => cell.tokens),
            ...(token.rows ?? []).flatMap((row) =>
                row.flatMap((cell) => cell.tokens),
            ),
        ];
        for (const child of children)
            pending.push({ token: child, depth: depth + 1 });
    }
    for (const href of definitions)
        if (!linkedDestinations.has(href))
            throw new ProposalMarkdownError('unsupported');
    return formattingAdjusted;
}

/** Validate decoded output too: token text can contain whitespace entities. */
function checkVisibleContent(node: JSONContent) {
    if (node.type === 'heading' || node.type === 'listItem') {
        const pending = [node];
        let count = 0;
        let visible = false;
        while (pending.length) {
            if (++count > 5_000) throw new ProposalMarkdownError('limit');
            const current = pending.pop()!;
            if (current.text?.trim()) {
                visible = true;
                break;
            }
            pending.push(...(current.content ?? []));
        }
        if (!visible) throw new ProposalMarkdownError('unsupported');
    }
    let href: string | undefined;
    let label = '';
    function finishLink() {
        if (href && !label.trim())
            throw new ProposalMarkdownError('unsupported');
    }
    for (const child of node.content ?? []) {
        const link = child.marks?.find((mark) => mark.type === 'link');
        const next = link?.attrs?.href as string | undefined;
        if (next !== href) {
            finishLink();
            href = next;
            label = '';
        }
        if (href) label += child.text ?? '';
    }
    finishLink();
}

/** Convert only an explicitly accepted chat proposal; persisted documents remain JSON. */
export function parseProposalMarkdown(text: string): {
    document: JSONContent;
    headingMapped: boolean;
    formattingAdjusted: boolean;
} {
    checkInput(text);
    try {
        const formattingAdjusted = preflight(text);
        const document = manager.parse(text);
        let headingMapped = false;
        const pending = [{ node: document, depth: 0 }];
        let count = 0;
        while (pending.length) {
            const { node, depth } = pending.pop()!;
            if (++count > 5_000 || depth > 12)
                throw new ProposalMarkdownError('limit');
            checkVisibleContent(node);
            if (node.type === 'heading') {
                const original = node.attrs?.level as number;
                const level = original === 1 ? 2 : original > 3 ? 3 : original;
                headingMapped ||= level !== original;
                node.attrs = { level };
            }
            // The stored schema deliberately forbids code combined with other marks.
            // Reject the whole proposal rather than silently stripping emphasis/links.
            if (
                node.marks?.some((mark) => mark.type === 'code') &&
                node.marks.length > 1
            )
                throw new ProposalMarkdownError('unsupported');
            pending.push(
                ...(node.content ?? []).map((child) => ({
                    node: child,
                    depth: depth + 1,
                })),
            );
        }
        return {
            document: toEditorDocument(
                normalizeEditorDocument(document).document,
            ),
            headingMapped,
            formattingAdjusted,
        };
    } catch (error) {
        if (error instanceof ProposalMarkdownError) throw error;
        throw new ProposalMarkdownError('invalid');
    }
}

/** Explicit fallback: retain the source literally, including blank lines. */
export function proposalPlainTextDocument(text: string): JSONContent {
    checkInput(text);
    const document: JSONContent = {
        type: 'doc',
        content: text.split(/\r?\n/u).map((line) => ({
            type: 'paragraph',
            ...(line ? { content: [{ type: 'text', text: line }] } : {}),
        })),
    };
    try {
        return toEditorDocument(normalizeEditorDocument(document).document);
    } catch {
        throw new ProposalMarkdownError('limit');
    }
}
