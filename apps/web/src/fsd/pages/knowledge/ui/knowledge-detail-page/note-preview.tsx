import type { KnowledgeWorkingContent } from '@languon/contracts';
import { KnowledgeBody, knowledgeCategoryKeys } from '@/fsd/entities/knowledge';
import { useI18n } from '@/fsd/shared/i18n';
import { Badge } from '@/fsd/shared/ui';
import styles from './knowledge-detail-page.module.css';

export function NotePreview({ content }: { content: KnowledgeWorkingContent }) {
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
            <KnowledgeBody
                body={content.body}
                {...(content.explanationLanguage
                    ? { language: content.explanationLanguage }
                    : {})}
            />
        </div>
    );
}
