import { Streamdown, type AnimateOptions, type Components } from 'streamdown';
import remarkGfm from 'remark-gfm';
import { safeChatLink } from '@/fsd/entities/conversation';
import styles from './chat-markdown.module.css';

const plugins = [remarkGfm];
// Streamdown defaults include rehype-raw. Keep raw HTML out of the AST entirely.
const rehypePlugins: [] = [];
const linkSafety = { enabled: false };
const animation: AnimateOptions = {
    animation: 'fadeIn',
    duration: 120,
    sep: 'word',
    stagger: 12,
    maxBacklogMs: 120,
};
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
    'h2',
    'h3',
    'h4',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'a',
    'code',
    'pre',
    'hr',
    // Generated only by Streamdown's animation plugin; raw HTML stays disabled.
    'span',
];

// Own every allowed element: built-in code/table/link renderers depend on
// Tailwind and interactive controls that are inappropriate for tutor output.
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
    h2: 'h2',
    h3: 'h3',
    h4: 'h4',
    table: 'table',
    thead: 'thead',
    tbody: 'tbody',
    tr: 'tr',
    th: 'th',
    td: 'td',
    a: SafeAnchor,
    code: 'code',
    pre: 'pre',
    hr: 'hr',
    span: 'span',
};

export function ChatMarkdown({
    content,
    streaming = false,
    workspace = false,
}: {
    content: string;
    streaming?: boolean;
    workspace?: boolean;
}) {
    const mode = streaming ? 'streaming' : 'static';
    const animated = streaming ? animation : false;

    return (
        <div
            data-assistant-content
            data-streaming={streaming}
            data-workspace={workspace}
            dir='auto'
        >
            <Streamdown
                className={styles.markdown ?? ''}
                mode={mode}
                dir='auto'
                isAnimating={streaming}
                parseIncompleteMarkdown={streaming}
                animated={animated}
                controls={false}
                linkSafety={linkSafety}
                remarkPlugins={plugins}
                rehypePlugins={rehypePlugins}
                allowedElements={elements}
                skipHtml
                urlTransform={safeChatLink}
                components={components}
            >
                {content}
            </Streamdown>
        </div>
    );
}

function SafeAnchor({
    href,
    children,
}: React.ComponentProps<'a'> | Record<string, unknown>) {
    // Streamdown's custom-tag index signature uses unknown values; anchor
    // children are the React tree produced by its Markdown renderer.
    const label = children as React.ReactNode;
    const safeHref = typeof href === 'string' ? safeChatLink(href) : undefined;
    if (!safeHref) return <span>{label}</span>;
    return (
        <a href={safeHref} target='_blank' rel='noopener noreferrer'>
            {label}
        </a>
    );
}
