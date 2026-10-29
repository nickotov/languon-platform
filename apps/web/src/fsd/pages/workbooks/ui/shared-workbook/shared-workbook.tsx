'use client';
import { WorkbookProgressSummary } from '../workbook-progress-summary/workbook-progress-summary';
import { useState } from 'react';
import type { WorkbookLearningShareAccess } from '@languon/contracts';
import { useSessionStore } from '@/fsd/entities/session';
import { LearningNote } from '../learning-note/learning-note';
import { workbookLabels } from '@/fsd/features/workbooks';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Button,
    ButtonLink,
    InlineAlert,
    LoadingState,
    Select,
} from '@/fsd/shared/ui';
import type { ChangeEvent } from 'react';
import { useSharedWorkbook } from '../../hooks/use-shared-workbook';
import styles from '../workbook-layout.module.css';

export function SharedWorkbookPage({ locator }: { locator: string }) {
    const { locale, href } = useI18n();
    const labels = workbookLabels(locale);
    const signedIn = useSessionStore(
        (state) => state.status === 'authenticated',
    );
    const model = useSharedWorkbook(locator);
    const [selectedId, setSelectedId] = useState('');
    const workbook = model.query.data?.workbook;
    const notes = workbook?.notes ?? [];
    const index = Math.max(
        0,
        notes.findIndex((note) => note.id === selectedId),
    );
    const note = notes[index];
    const options = notes.map((item) => ({
        value: item.id,
        label: item.title,
    }));
    const selected = note?.id ?? '';
    const access: WorkbookLearningShareAccess = {
        kind: 'workbook',
        locator,
        key: model.key ?? '',
    };
    const signInHref = href(
        `/login?returnTo=${encodeURIComponent(`/shared/workbooks/${locator}`)}`,
    );
    function choose(event: ChangeEvent<HTMLSelectElement>) {
        setSelectedId(event.target.value);
    }
    function previous() {
        const item = notes[index - 1];
        if (item) setSelectedId(item.id);
    }
    function next() {
        const item = notes[index + 1];
        if (item) setSelectedId(item.id);
    }
    function copy() {
        void model.copy();
    }
    function reload() {
        void model.query.refetch();
    }
    if (model.key === null || (model.key && model.query.isPending))
        return (
            <main className={styles.page}>
                <LoadingState>{labels.loading}</LoadingState>
            </main>
        );
    if (!model.key || !workbook || model.query.isError)
        return (
            <main className={styles.page}>
                <InlineAlert
                    tone='error'
                    actions={<Button onClick={reload}>{labels.reload}</Button>}
                >
                    {labels.unavailable}
                </InlineAlert>
            </main>
        );
    return (
        <main className={styles.page}>
            <header>
                <p>{labels.shared}</p>
                <h1 className={styles.title} dir='auto'>
                    {workbook.title}
                </h1>
                <p>{labels.readOnly}</p>
            </header>
            <WorkbookProgressSummary
                workbookId={workbook.id}
                workbookVersion={workbook.version}
                access={access}
            />
            {signedIn ? (
                <Button loading={model.copying} onClick={copy}>
                    {labels.copy}
                </Button>
            ) : (
                <ButtonLink href={signInHref}>{labels.signIn}</ButtonLink>
            )}
            {model.copyError && (
                <InlineAlert tone='error'>{labels.error}</InlineAlert>
            )}
            {notes.length === 0 && <p>{labels.noSaved}</p>}
            {note && (
                <>
                    <Select
                        label={labels.notes}
                        value={selected}
                        onChange={choose}
                        options={options}
                    />
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
                    <article className={styles.panel} key={note.id}>
                        <h2 dir='auto'>{note.title}</h2>
                        <LearningNote note={note} access={access} />
                    </article>
                </>
            )}
        </main>
    );
}
