import { AudioLines, ChevronRight } from 'lucide-react';
import {
    KnowledgeNarration,
    type KnowledgeNarrationProps,
} from '@/fsd/widgets/knowledge-speech';
import {
    KnowledgeTranscription,
    type KnowledgeTranscriptionProps,
} from '@/fsd/widgets/knowledge-transcription';
import { useI18n } from '@/fsd/shared/i18n';
import styles from './knowledge-media-tools.module.css';

const labels = {
    en: 'Audio tools',
    ru: 'Работа с аудио',
    es: 'Herramientas de audio',
    fr: 'Outils audio',
};

/** Native disclosure keeps in-flight previews mounted while the document stays quiet. */
export function KnowledgeMediaTools({
    narration,
    transcription,
}: {
    narration: KnowledgeNarrationProps;
    transcription: KnowledgeTranscriptionProps;
}) {
    const { locale } = useI18n();
    return (
        <details className={styles.tools}>
            <summary className={styles.trigger}>
                <AudioLines aria-hidden size={16} />
                <span>{labels[locale]}</span>
                <ChevronRight
                    aria-hidden
                    size={14}
                    className={styles.chevron}
                />
            </summary>
            <div className={styles.content}>
                <KnowledgeNarration {...narration} hideWhenEmpty />
                <KnowledgeTranscription {...transcription} hideWhenEmpty />
            </div>
        </details>
    );
}
