import { useState, type ChangeEvent, type FormEvent } from 'react';
import type { WorkbookLabels } from '@/fsd/features/workbooks';
import { Button, InlineAlert, Select } from '@/fsd/shared/ui';
import type { useWorkbookDetail } from '../../hooks/use-workbook-detail';
import styles from '../workbook-layout.module.css';

export function WorkbookMembership({
    model,
    labels,
}: {
    model: ReturnType<typeof useWorkbookDetail>;
    labels: WorkbookLabels;
}) {
    const [selected, setSelected] = useState('');
    const [acknowledged, setAcknowledged] = useState(false);
    const workbook = model.workbook!;
    const memberIds = new Set(workbook.notes.map((note) => note.id));
    const available =
        model.library.data?.pages
            .flatMap((page) => page.workspaces)
            .filter((note) => !memberIds.has(note.id)) ?? [];
    const options = [
        { value: '', label: labels.choose },
        ...available.map((note) => ({ value: note.id, label: note.title })),
    ];
    const blocked =
        !selected || model.busy || (workbook.shared && !acknowledged);
    function choose(event: ChangeEvent<HTMLSelectElement>) {
        setSelected(event.target.value);
        setAcknowledged(false);
    }
    function acknowledge(event: ChangeEvent<HTMLInputElement>) {
        setAcknowledged(event.target.checked);
    }
    function more() {
        void model.library.fetchNextPage();
    }
    function reload() {
        void model.library.refetch();
    }
    async function add(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (blocked) return;
        const done = await model.setNotes(
            [...memberIds, selected],
            acknowledged,
        );
        if (done) {
            setSelected('');
            setAcknowledged(false);
        }
    }
    return (
        <form className={styles.panel} onSubmit={add}>
            <Select
                label={labels.addNote}
                value={selected}
                onChange={choose}
                options={options}
                loading={model.library.isPending}
            />
            {model.library.isError && (
                <InlineAlert
                    tone='error'
                    actions={
                        <Button type='button' onClick={reload}>
                            {labels.reload}
                        </Button>
                    }
                >
                    {labels.error}
                </InlineAlert>
            )}
            {workbook.shared && (
                <label className={styles.notice}>
                    <input
                        type='checkbox'
                        checked={acknowledged}
                        onChange={acknowledge}
                    />
                    {labels.acknowledge}
                </label>
            )}
            <div className={styles.actions}>
                <Button type='submit' disabled={blocked}>
                    {labels.add}
                </Button>
                {model.library.hasNextPage && (
                    <Button
                        type='button'
                        variant='secondary'
                        loading={model.library.isFetchingNextPage}
                        onClick={more}
                    >
                        {labels.more}
                    </Button>
                )}
            </div>
        </form>
    );
}
