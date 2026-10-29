'use client';
import { WorkbookProgressSummary } from '../workbook-progress-summary/workbook-progress-summary';
import { useState, type FormEvent, type ChangeEvent } from 'react';
import Link from 'next/link';
import { workbookLabels } from '@/fsd/features/workbooks';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, InlineAlert, Input, LoadingState } from '@/fsd/shared/ui';
import { useWorkbookDetail } from '../../hooks/use-workbook-detail';
import { WorkbookNoteRow } from './workbook-note-row';
import { WorkbookMembership } from './workbook-membership';
import { WorkbookReader } from './workbook-reader';
import styles from '../workbook-layout.module.css';

export function WorkbookDetail({ workbookId }: { workbookId: string }) {
    const { locale, href } = useI18n();
    const labels = workbookLabels(locale);
    const model = useWorkbookDetail(workbookId);
    const [title, setTitle] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const workbook = model.workbook;
    function reload() {
        void model.query.refetch();
    }
    function change(event: ChangeEvent<HTMLInputElement>) {
        setTitle(event.target.value);
    }
    function rename(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (title !== null) void model.rename(title);
    }
    function requestDelete() {
        setConfirmDelete(true);
    }
    function cancelDelete() {
        setConfirmDelete(false);
    }
    function remove() {
        void model.remove();
    }
    function share() {
        void model.share();
    }
    function copy() {
        void model.copy();
    }
    function revoke() {
        void model.revoke();
    }
    function removeNote(id: string) {
        if (workbook)
            void model.setNotes(
                workbook.notes
                    .filter((note) => note.id !== id)
                    .map((note) => note.id),
            );
    }
    function move(index: number, delta: number) {
        if (!workbook) return;
        const ids = workbook.notes.map((note) => note.id);
        const target = index + delta;
        if (target < 0 || target >= ids.length) return;
        [ids[index], ids[target]] = [ids[target]!, ids[index]!];
        void model.setNotes(ids);
    }
    if (model.query.isPending)
        return (
            <main className={styles.page}>
                <LoadingState>{labels.loading}</LoadingState>
            </main>
        );
    if (!workbook || model.query.isError)
        return (
            <main className={styles.page}>
                <InlineAlert
                    tone='error'
                    actions={<Button onClick={reload}>{labels.reload}</Button>}
                >
                    {labels.error}
                </InlineAlert>
            </main>
        );
    const titleValue = title ?? workbook.title;
    const copyBlocked = workbook.notes.some((note) => note.status !== 'saved');
    return (
        <main className={styles.page}>
            <Link href={href('/workbooks')} className={styles.link}>
                {labels.back}
            </Link>
            <h1 className={styles.title} dir='auto'>
                {workbook.title}
            </h1>
            {model.error && (
                <InlineAlert tone='error'>{labels.error}</InlineAlert>
            )}
            <form className={styles.panel} onSubmit={rename}>
                <Input
                    required
                    maxLength={200}
                    label={labels.name}
                    value={titleValue}
                    onChange={change}
                />
                <Button type='submit' loading={model.busy}>
                    {labels.save}
                </Button>
            </form>
            <section className={styles.panel}>
                <p>{labels.shareNotice}</p>
                {copyBlocked && (
                    <InlineAlert tone='info'>
                        {labels.copyNeedsSavedNotes}
                    </InlineAlert>
                )}
                <Button
                    variant='secondary'
                    disabled={model.busy || copyBlocked}
                    onClick={copy}
                >
                    {labels.copy}
                </Button>
                <div className={styles.actions}>
                    <Button
                        variant='secondary'
                        disabled={model.busy}
                        onClick={share}
                    >
                        {labels.share}
                    </Button>
                    {workbook.shared && (
                        <Button
                            variant='secondary'
                            disabled={model.busy}
                            onClick={revoke}
                        >
                            {labels.revoke}
                        </Button>
                    )}
                </div>
                {model.shareLink && (
                    <Input
                        label={labels.shareLink}
                        value={model.shareLink}
                        readOnly
                    />
                )}
            </section>
            <h2>{labels.notes}</h2>
            <WorkbookMembership model={model} labels={labels} />
            {workbook.notes.length === 0 && <p>{labels.noNotes}</p>}
            <ol className={styles.list}>
                {workbook.notes.map((note, index) => (
                    <WorkbookNoteRow
                        key={note.id}
                        note={note}
                        index={index}
                        count={workbook.notes.length}
                        busy={model.busy}
                        labels={labels}
                        onMove={move}
                        onRemove={removeNote}
                        onSelect={setSelectedId}
                    />
                ))}
            </ol>
            <WorkbookProgressSummary
                workbookId={workbook.id}
                workbookVersion={workbook.version}
            />
            <WorkbookReader
                workbook={workbook}
                selectedId={selectedId}
                onSelect={setSelectedId}
                labels={labels}
            />
            <section className={styles.panel}>
                <p>{labels.keepNotes}</p>
                {confirmDelete ? (
                    <>
                        <p>{labels.deleteConfirm}</p>
                        <div className={styles.actions}>
                            <Button
                                variant='danger'
                                loading={model.busy}
                                onClick={remove}
                            >
                                {labels.delete}
                            </Button>
                            <Button
                                variant='secondary'
                                disabled={model.busy}
                                onClick={cancelDelete}
                            >
                                {labels.cancel}
                            </Button>
                        </div>
                    </>
                ) : (
                    <Button variant='danger' onClick={requestDelete}>
                        {labels.delete}
                    </Button>
                )}
            </section>
        </main>
    );
}
