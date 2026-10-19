import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { safeChatLink } from '@/fsd/entities/conversation';
import styles from './chat-markdown.module.css';

const plugins = [remarkGfm];
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
];

export function ChatMarkdown({ content }: { content: string }) {
    return (
        <div className={styles.markdown} dir='auto'>
            <ReactMarkdown
                remarkPlugins={plugins}
                allowedElements={elements}
                skipHtml
                urlTransform={safeChatLink}
                components={{ a: SafeAnchor }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}

function SafeAnchor({
    href,
    children,
}: {
    href?: string | undefined;
    children?: React.ReactNode;
}) {
    if (!href) return <span>{children}</span>;
    return (
        <a href={href} target='_blank' rel='noopener noreferrer'>
            {children}
        </a>
    );
}
