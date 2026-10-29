import Link from 'next/link';
import type { Workbook } from '@languon/contracts';
import type { WorkbookLabels } from '@/fsd/features/workbooks';
import { useI18n } from '@/fsd/shared/i18n';
import { Badge, Button } from '@/fsd/shared/ui';
import styles from '../workbook-layout.module.css';

export function WorkbookNoteRow({
    note,
    index,
    count,
    busy,
    labels,
    onMove,
    onRemove,
    onSelect,
}: {
    note: Workbook['notes'][number];
    index: number;
    count: number;
    busy: boolean;
    labels: WorkbookLabels;
    onMove: (index: number, delta: number) => void;
    onRemove: (id: string) => void;
    onSelect: (id: string) => void;
}) {
    const { href } = useI18n();
    function up() {
        onMove(index, -1);
    }
    function down() {
        onMove(index, 1);
    }
    function remove() {
        onRemove(note.id);
    }
    function select() {
        onSelect(note.id);
    }
    return (
        <li className={styles.panel}>
            <div className={styles.header}>
                <Button
                    variant='ghost'
                    disabled={note.status === 'draft'}
                    onClick={select}
                >
                    {note.title}
                </Button>
                {note.status === 'draft' && <Badge>{labels.draft}</Badge>}
            </div>
            <div className={styles.actions}>
                <Link
                    className={styles.link}
                    href={href(`/knowledge/${note.id}`)}
                >
                    {labels.open}
                </Link>
                <Button
                    variant='secondary'
                    disabled={busy || index === 0}
                    onClick={up}
                >
                    {labels.up}
                </Button>
                <Button
                    variant='secondary'
                    disabled={busy || index === count - 1}
                    onClick={down}
                >
                    {labels.down}
                </Button>
                <Button variant='quiet' disabled={busy} onClick={remove}>
                    {labels.remove}
                </Button>
            </div>
        </li>
    );
}
