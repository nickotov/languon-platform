import { KnowledgeDocumentView } from '@/fsd/features/knowledge-notes';
import type { ComponentProps } from 'react';
import type { KnowledgeWorkingContent } from '@languon/contracts';
import { knowledgeCategoryKeys } from '@/fsd/entities/knowledge';
import { useI18n } from '@/fsd/shared/i18n';
import { Badge } from '@/fsd/shared/ui';
import styles from './knowledge-detail-page.module.css';

export function NotePreview({
    content,
    blockOptions,
    library,
    blockCopy,
    renderBlockMenu,
    getBlockActions,
    wrapBlock,
}: {
    content: KnowledgeWorkingContent;
    wrapBlock?: ComponentProps<typeof KnowledgeDocumentView>['wrapBlock'];
    blockOptions?: ComponentProps<typeof KnowledgeDocumentView>['blockOptions'];
    library?: ComponentProps<typeof KnowledgeDocumentView>['library'];
    blockCopy?: ComponentProps<typeof KnowledgeDocumentView>['blockCopy'];
    renderBlockMenu?: ComponentProps<
        typeof KnowledgeDocumentView
    >['renderBlockMenu'];
    getBlockActions?: ComponentProps<
        typeof KnowledgeDocumentView
    >['getBlockActions'];
}) {
    const { t, locale } = useI18n();
    const names = new Intl.DisplayNames([locale], { type: 'language' });
    function language(value: string) {
        try {
            return names.of(value) ?? value;
        } catch {
            return value;
        }
    }
    return (
        <div className={styles.preview}>
            {content.summary && (
                <p className={styles.summary} dir='auto'>
                    {content.summary}
                </p>
            )}
            {content.categories.length > 0 && (
                <div className={styles.categories}>
                    {content.categories.map((category) => (
                        <Badge key={category}>
                            {t(knowledgeCategoryKeys[category])}
                        </Badge>
                    ))}
                </div>
            )}
            {(content.studiedLanguage || content.explanationLanguage) && (
                <dl className={styles.languages}>
                    {content.studiedLanguage && (
                        <div>
                            <dt>{t('knowledge.studiedLanguage')}</dt>
                            <dd>{language(content.studiedLanguage)}</dd>
                        </div>
                    )}
                    {content.explanationLanguage && (
                        <div>
                            <dt>{t('knowledge.explanationLanguage')}</dt>
                            <dd>{language(content.explanationLanguage)}</dd>
                        </div>
                    )}
                </dl>
            )}
            <KnowledgeDocumentView
                body={content.body}
                blockOptions={blockOptions}
                library={library}
                blockCopy={blockCopy}
                renderBlockMenu={renderBlockMenu}
                getBlockActions={getBlockActions}
                wrapBlock={wrapBlock}
                {...(content.explanationLanguage
                    ? { language: content.explanationLanguage }
                    : {})}
            />
        </div>
    );
}
