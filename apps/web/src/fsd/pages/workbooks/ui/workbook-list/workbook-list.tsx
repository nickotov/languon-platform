'use client';
import { useRef, useState, type FormEvent, type ChangeEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/fsd/features/auth';
import { useSessionStore } from '@/fsd/entities/session';
import { workbookApi, workbookLabels } from '@/fsd/features/workbooks';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, Input, InlineAlert, LoadingState } from '@/fsd/shared/ui';
import styles from '../workbook-layout.module.css';

export function WorkbookList() {
    const { requestWithSession } = useAuth();
    const actorId = useSessionStore((state) => state.user?.id);
    const { locale, href } = useI18n();
    const labels = workbookLabels(locale);
    const router = useRouter();
    const [title, setTitle] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const operation = useRef(crypto.randomUUID());
    const query = useQuery({
        queryKey: ['workbooks', actorId],
        queryFn: ({ signal }) =>
            requestWithSession((token) => workbookApi.list(token, signal)),
        retry: false,
        gcTime: 0,
    });
    function change(event: ChangeEvent<HTMLInputElement>) {
        setTitle(event.target.value);
    }
    function reload() {
        void query.refetch();
    }
    async function create(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError(false);
        try {
            const result = await requestWithSession((token) =>
                workbookApi.create(token, { id: operation.current, title }),
            );
            router.push(href(`/workbooks/${result.workbook.id}`));
        } catch {
            setError(true);
        } finally {
            setBusy(false);
        }
    }
    return (
        <main className={styles.page}>
            <Link href={href('/knowledge')} className={styles.link}>
                {labels.knowledge}
            </Link>
            <header>
                <h1 className={styles.title}>{labels.title}</h1>
                <p>{labels.description}</p>
            </header>
            <form onSubmit={create} className={styles.panel}>
                <Input
                    label={labels.name}
                    value={title}
                    onChange={change}
                    maxLength={200}
                    required
                />
                <Button type='submit' loading={busy}>
                    {labels.create}
                </Button>
            </form>
            {error && <InlineAlert tone='error'>{labels.error}</InlineAlert>}
            {query.isPending && <LoadingState>{labels.loading}</LoadingState>}
            {query.isError && (
                <InlineAlert
                    tone='error'
                    actions={<Button onClick={reload}>{labels.reload}</Button>}
                >
                    {labels.error}
                </InlineAlert>
            )}
            {query.data?.workbooks.length === 0 && <p>{labels.empty}</p>}
            <ul className={styles.list}>
                {query.data?.workbooks.map((book) => (
                    <li key={book.id} className={styles.panel}>
                        <Link
                            className={styles.link}
                            href={href(`/workbooks/${book.id}`)}
                        >
                            {book.title}
                        </Link>
                        <span>
                            {labels.notes}: {book.notes.length}
                        </span>
                    </li>
                ))}
            </ul>
        </main>
    );
}
