import { Button } from '@/fsd/shared/ui';
import type {
    KnowledgeTextLibraryPreview,
    KnowledgeVocabularyPreview,
} from '@languon/contracts';
import type { LibraryLabels } from './library-labels';
import styles from './library-copy.module.css';
type Preview =
    | { kind: 'vocabulary'; content: KnowledgeVocabularyPreview }
    | { kind: 'text'; content: KnowledgeTextLibraryPreview };
export function LibraryCopyPreview({
    preview,
    labels,
    busy,
    onCommit,
}: {
    preview: Preview;
    labels: LibraryLabels;
    busy: boolean;
    onCommit(): void;
}) {
    return (
        <div className={styles.preview} aria-label={labels.preview}>
            {preview.kind === 'vocabulary' ? (
                preview.content.entries.map((entry) => (
                    <div key={entry.id}>
                        <strong>
                            {entry.term} — {entry.translation}
                        </strong>
                        {entry.pronunciation && <p>{entry.pronunciation}</p>}
                        {entry.definition && <p>{entry.definition}</p>}
                        {entry.example && <p>{entry.example}</p>}
                        {entry.exampleTranslation && (
                            <p>{entry.exampleTranslation}</p>
                        )}
                    </div>
                ))
            ) : (
                <>
                    <strong>{preview.content.text.title}</strong>
                    <p>{preview.content.text.sourceText}</p>
                    {preview.content.text.alignment?.translation.map(
                        (segment) => (
                            <p key={segment.pairId}>{segment.text}</p>
                        ),
                    )}
                </>
            )}
            <Button type='button' loading={busy} onClick={onCommit}>
                {labels.commit}
            </Button>
        </div>
    );
}
