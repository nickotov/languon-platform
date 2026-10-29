import { useQuery } from '@tanstack/react-query';
import type { Workbook } from '@languon/contracts';
import { knowledgeApi } from '@/fsd/entities/knowledge';
import { useSessionStore } from '@/fsd/entities/session';
import { useAuth } from '@/fsd/features/auth';
import { LearningNote } from '../learning-note/learning-note';
import type { WorkbookLabels } from '@/fsd/features/workbooks';
import { Button, InlineAlert, LoadingState } from '@/fsd/shared/ui';
import styles from '../workbook-layout.module.css';

export function WorkbookReader({
    workbook,
    selectedId,
    onSelect,
    labels,
}: {
    workbook: Workbook;
    selectedId: string | null;
    onSelect: (id: string) => void;
    labels: WorkbookLabels;
}) {
    const { requestWithSession } = useAuth();
    const actorId = useSessionStore((state) => state.user?.id);
    const notes = workbook.notes.filter((note) => note.status === 'saved');
    const index = Math.max(
        0,
        notes.findIndex((note) => note.id === selectedId),
    );
    const selected = notes[index];
    const query = useQuery({
        queryKey: ['workbook-note', actorId, selected?.id, workbook.version],
        queryFn: ({ signal }) =>
            requestWithSession((token) =>
                knowledgeApi.read(token, selected!.id, signal),
            ),
        enabled: Boolean(selected),
        retry: false,
        gcTime: 0,
    });
    function previous() {
        const note = notes[index - 1];
        if (note) onSelect(note.id);
    }
    function next() {
        const note = notes[index + 1];
        if (note) onSelect(note.id);
    }
    if (!selected) return null;
    return (
        <section className={styles.panel}>
            <nav className={styles.actions}>
                <Button
                    variant='secondary'
                    disabled={index === 0}
                    onClick={previous}
                >
                    {labels.previous}
                </Button>
                <Button
                    variant='secondary'
                    disabled={index === notes.length - 1}
                    onClick={next}
                >
                    {labels.next}
                </Button>
            </nav>
            <h2 dir='auto'>{selected.title}</h2>
            {query.isPending && <LoadingState>{labels.loading}</LoadingState>}
            {query.isError && (
                <InlineAlert tone='error'>{labels.error}</InlineAlert>
            )}
            {query.data && <LearningNote note={query.data} />}
        </section>
    );
}
