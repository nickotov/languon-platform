import type { ComponentProps, ReactNode } from 'react';
import { Streamdown, type Components } from 'streamdown';
import remarkGfm from 'remark-gfm';
import { KnowledgeLinkSchema } from '@languon/contracts';
import styles from './learning-narrative.module.css';

const elements = [
    'p',
    'strong',
    'em',
    'del',
    'blockquote',
    'ul',
    'ol',
    'li',
    'br',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'a',
    'code',
    'pre',
];
const components: Components = {
    p: 'p',
    strong: 'strong',
    em: 'em',
    del: 'del',
    blockquote: 'blockquote',
    ul: 'ul',
    ol: 'ol',
    li: 'li',
    br: 'br',
    h1: 'h3',
    h2: 'h3',
    h3: 'h3',
    h4: 'h4',
    h5: 'h4',
    h6: 'h4',
    table: 'table',
    thead: 'thead',
    tbody: 'tbody',
    tr: 'tr',
    th: 'th',
    td: 'td',
    a: SafeAnchor,
    code: 'code',
    pre: 'pre',
};
const remarkPlugins = [remarkGfm, literalHtml];
// Streamdown otherwise includes raw HTML processing by default.
const rehypePlugins: [] = [];
const linkSafety = { enabled: false };

/** Markdown belongs only to author explanations, never verbatim learning sources. */
export function LearningNarrative({
    content,
    className,
}: {
    content: string;
    className?: string | undefined;
}) {
    const classes = [styles.root, className].filter(Boolean).join(' ');
    return (
        <Streamdown
            className={classes}
            dir='auto'
            mode='static'
            parseIncompleteMarkdown={false}
            animated={false}
            controls={false}
            linkSafety={linkSafety}
            remarkPlugins={remarkPlugins}
            rehypePlugins={rehypePlugins}
            allowedElements={elements}
            skipHtml
            urlTransform={safeLink}
            components={components}
        >
            {content}
        </Streamdown>
    );
}

function safeLink(value: string) {
    return KnowledgeLinkSchema.safeParse(value).success ? value : undefined;
}

function SafeAnchor({
    href,
    children,
}: ComponentProps<'a'> | Record<string, unknown>) {
    const safeHref = typeof href === 'string' ? safeLink(href) : undefined;
    const label = children as ReactNode;
    return safeHref ? (
        <a href={safeHref} target='_blank' rel='noopener noreferrer'>
            {label}
        </a>
    ) : (
        <span>{label}</span>
    );
}

type MarkdownNode = { type: string; value?: string; children?: MarkdownNode[] };
function literalHtml() {
    return function transform(node: MarkdownNode) {
        // Preserve older plain-text blocks containing literal tags. They never
        // become HTML nodes, attributes, media requests, or executable content.
        if (node.type === 'html') node.type = 'text';
        node.children?.forEach(transform);
    };
}
