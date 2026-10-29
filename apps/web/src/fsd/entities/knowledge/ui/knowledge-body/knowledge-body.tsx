import { createElement, type ReactNode } from 'react';
import { renderJSONContentToReactElement } from '@tiptap/static-renderer/json/react';
import {
    KnowledgeBodySchema,
    type KnowledgeBody as Body,
    type KnowledgeMark,
    type KnowledgeNode,
    type LearningBlock,
} from '@languon/contracts';
import styles from './knowledge-body.module.css';

type RenderNode = {
    type: KnowledgeNode['type'];
    text?: string;
    attrs?: NonNullable<KnowledgeNode['attrs']>;
    marks?: KnowledgeMark[];
    content?: RenderNode[];
    learningContent?: ReactNode;
};

function toRenderNode(
    node: KnowledgeNode,
    renderLearningBlock?: (block: LearningBlock) => ReactNode,
): RenderNode {
    let learningContent: ReactNode;
    if (node.type === 'learningBlock') {
        if (!node.attrs?.block || !renderLearningBlock)
            throw new Error(
                'Interactive content requires a learning-block renderer.',
            );
        learningContent = renderLearningBlock(node.attrs.block);
    }
    return {
        ...(node.type === 'learningBlock' ? { learningContent } : {}),
        type: node.type,
        ...(node.text !== undefined ? { text: node.text } : {}),
        ...(node.attrs ? { attrs: node.attrs } : {}),
        ...(node.marks ? { marks: node.marks } : {}),
        ...(node.content
            ? {
                  content: node.content.map((child) =>
                      toRenderNode(child, renderLearningBlock),
                  ),
              }
            : {}),
    };
}

// Mapping functions are React component types: retain their identities across updates.
type DocumentMappings = Parameters<
    typeof renderJSONContentToReactElement<KnowledgeMark, RenderNode>
>[0];
const documentMappings: DocumentMappings = {
    nodeMapping: {
        learningBlock: ({ node }) => node.learningContent,
        doc: ({ children }) => <>{children}</>,
        text: ({ node }) => node.text ?? '',
        paragraph: ({ children }) => <p dir='auto'>{children}</p>,
        heading: ({ node, children }) =>
            createElement(
                node.attrs?.level === 3 ? 'h3' : 'h2',
                { dir: 'auto' },
                children,
            ),
        hardBreak: () => <br />,
        bulletList: ({ children }) => <ul>{children}</ul>,
        orderedList: ({ node, children }) => (
            <ol start={node.attrs?.start ?? 1}>{children}</ol>
        ),
        listItem: ({ children }) => <li>{children}</li>,
        blockquote: ({ children }) => <blockquote>{children}</blockquote>,
        table: ({ children }) => (
            <div className={styles.tableScroll}>
                <table>
                    <tbody>{children}</tbody>
                </table>
            </div>
        ),
        tableRow: ({ children }) => <tr>{children}</tr>,
        tableCell: ({ children }) => <td>{children}</td>,
        tableHeader: ({ children }) => <th scope='col'>{children}</th>,
    },
    markMapping: {
        bold: ({ children }) => <strong>{children}</strong>,
        italic: ({ children }) => <em>{children}</em>,
        underline: ({ children }) => <u>{children}</u>,
        strike: ({ children }) => <s>{children}</s>,
        code: ({ children }) => <code>{children}</code>,
        link: ({ mark, children }) =>
            mark.type === 'link' ? (
                <a
                    href={mark.attrs.href}
                    target='_blank'
                    rel='noopener noreferrer'
                >
                    {children}
                </a>
            ) : (
                <>{children}</>
            ),
    },
};

/** Validated JSON becomes React nodes; stored HTML/attributes are never injected. */
export function KnowledgeBody({
    body,
    language,
    className,
    renderLearningBlock,
}: {
    body: Body;
    language?: string;
    className?: string;
    renderLearningBlock?: (block: LearningBlock) => ReactNode;
}) {
    const parsed = KnowledgeBodySchema.parse(body);
    // Reset the renderer's positional key counter while preserving mapping component types.
    const renderDocument = renderJSONContentToReactElement<
        KnowledgeMark,
        RenderNode
    >(documentMappings);
    const containerClass = [styles.prose, className].filter(Boolean).join(' ');
    return (
        <div className={containerClass} lang={language} dir='auto'>
            {renderDocument({
                content: toRenderNode(parsed.document, renderLearningBlock),
            })}
        </div>
    );
}
