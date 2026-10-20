import { useMemo } from 'react';
import { KnowledgeBody } from '@/fsd/entities/knowledge';
import { useI18n } from '@/fsd/shared/i18n';
import { normalizeEditorDocument } from '../../lib/editor-document';
import {
    parseProposalMarkdown,
    proposalPlainTextDocument,
    ProposalMarkdownError,
} from '../../lib/proposal-markdown';
import { knowledgeProposalLabels } from './knowledge-proposal-copy';
import styles from './knowledge-proposal-content.module.css';

/** The preview uses the same validated document nodes as proposal acceptance. */
export function KnowledgeProposalContent({
    content,
    format = 'markdown',
}: {
    content: string;
    format?: 'markdown' | 'plain-text' | undefined;
}) {
    const { locale } = useI18n();
    const copy = knowledgeProposalLabels[locale];
    const parsed = useMemo(() => {
        try {
            const result =
                format === 'plain-text'
                    ? {
                          document: proposalPlainTextDocument(content),
                          headingMapped: false,
                          formattingAdjusted: false,
                      }
                    : parseProposalMarkdown(content);
            return {
                ...result,
                body: normalizeEditorDocument(result.document),
                error: null,
            };
        } catch (error) {
            return {
                body: null,
                headingMapped: false,
                formattingAdjusted: false,
                error:
                    error instanceof ProposalMarkdownError
                        ? error.code
                        : 'invalid',
            };
        }
    }, [content, format]);
    let errorNotice = copy.formatUnavailable;
    if (parsed.error === 'unsafe-link') errorNotice = copy.unsafeLink;
    if (parsed.error === 'limit') errorNotice = copy.formatLimit;
    return (
        <div className={styles.content}>
            {parsed.headingMapped && (
                <p role='status' className={styles.notice}>
                    {copy.headingMapped}
                </p>
            )}
            {parsed.formattingAdjusted && (
                <p role='status' className={styles.notice}>
                    {copy.formattingAdjusted}
                </p>
            )}
            {parsed.error && (
                <p role='status' className={styles.notice}>
                    {errorNotice}
                </p>
            )}
            {parsed.body ? (
                <KnowledgeBody body={parsed.body} />
            ) : (
                <div className={styles.literal}>{content}</div>
            )}
        </div>
    );
}
