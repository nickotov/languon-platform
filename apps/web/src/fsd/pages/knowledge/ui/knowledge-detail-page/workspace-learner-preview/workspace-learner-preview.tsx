import { useEffect, useRef, type ComponentProps } from 'react';
import { Eye, Pencil } from 'lucide-react';
import type {
    KnowledgeWorkingContent,
    LearningBlock,
} from '@languon/contracts';
import { Button } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import { NotePreview } from '../note-preview';
import styles from './workspace-learner-preview.module.css';

/** The shared reader presentation with local practice, preserving the mounted editor. */
export function WorkspaceLearnerPreview({
    content,
    blockOptions,
    onClose,
}: {
    content: KnowledgeWorkingContent;
    blockOptions: NonNullable<
        ComponentProps<typeof NotePreview>['blockOptions']
    >;
    onClose(): void;
}) {
    const { t } = useI18n();
    const heading = useRef<HTMLHeadingElement>(null);
    useEffect(() => {
        heading.current?.focus({ preventScroll: true });
    }, []);
    function readerOptions(block: LearningBlock) {
        const { audioUrl, hintTranscript, hintVideoSource, playback } =
            blockOptions(block);
        // Deliberately omit saved learner state, attempt callbacks and AI actions.
        return { audioUrl, hintTranscript, hintVideoSource, playback };
    }
    return (
        <section
            className={styles.root}
            aria-label={t('knowledge.learnerPreview')}
        >
            <div className={styles.controls}>
                <span className={styles.label}>
                    <Eye size={16} aria-hidden />
                    {t('knowledge.learnerPreview')}
                </span>
                <Button
                    variant='secondary'
                    size='compact'
                    leadingIcon={<Pencil size={16} aria-hidden />}
                    onClick={onClose}
                >
                    {t('knowledge.backToEditing')}
                </Button>
            </div>
            <p className={styles.hint}>{t('knowledge.learnerPreviewHint')}</p>
            <h1 className={styles.title} ref={heading} tabIndex={-1} dir='auto'>
                {content.title || t('knowledge.untitled')}
            </h1>
            <NotePreview content={content} blockOptions={readerOptions} />
        </section>
    );
}
