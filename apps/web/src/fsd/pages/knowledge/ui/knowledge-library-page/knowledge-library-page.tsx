'use client';
import { type ChangeEvent, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import {
    KnowledgeCategorySchema,
    type KnowledgeWorkspaceSummary,
} from '@languon/contracts';
import { useSessionStore } from '@/fsd/entities/session';
import { knowledgeApi, knowledgeCategoryKeys } from '@/fsd/entities/knowledge';
import { useAuth } from '@/fsd/features/auth';
import { workbookLabels } from '@/fsd/features/workbooks';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Badge,
    Button,
    EmptyState,
    InlineAlert,
    Input,
    LoadingState,
    Select,
} from '@/fsd/shared/ui';
import { useKnowledgeLibrary } from '../../hooks/use-knowledge-library';
import { KnowledgeAuthBoundary } from '../knowledge-auth-boundary/knowledge-auth-boundary';
import styles from './knowledge-library-page.module.css';

type Library = ReturnType<typeof useKnowledgeLibrary>;

export function KnowledgeLibraryPage() {
    const actorId = useSessionStore((state) => state.user?.id);
    return (
        <KnowledgeAuthBoundary returnTo='/knowledge'>
            <LibraryContent key={actorId} />
        </KnowledgeAuthBoundary>
    );
}

function LibraryContent() {
    const { t, locale, href } = useI18n();
    const { requestWithSession } = useAuth();
    const router = useRouter();
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState(false);
    const createId = useRef(crypto.randomUUID());
    const library = useKnowledgeLibrary();
    const languageOptions =
        library.languages.data?.languages.map((language) => ({
            value: language.tag,
            label: language.displayNames[locale],
        })) ?? [];
    const categoryOptions = [
        { value: '', label: t('knowledge.allCategories') },
        ...KnowledgeCategorySchema.options.map((category) => ({
            value: category,
            label: t(knowledgeCategoryKeys[category]),
        })),
    ];
    function search(event: ChangeEvent<HTMLInputElement>) {
        library.setSearch(event.target.value);
    }
    function category(event: ChangeEvent<HTMLSelectElement>) {
        const result = KnowledgeCategorySchema.safeParse(event.target.value);
        library.setCategory(result.success ? result.data : '');
    }
    function language(event: ChangeEvent<HTMLSelectElement>) {
        library.setLanguage(event.target.value);
    }
    function more() {
        void library.notes.fetchNextPage();
    }
    async function create() {
        setCreating(true);
        setCreateError(false);
        try {
            const workspace = await requestWithSession((token) =>
                knowledgeApi.createDraft(token, createId.current),
            );
            createId.current = crypto.randomUUID();
            router.push(href(`/knowledge/${workspace.noteId}`));
        } catch {
            setCreateError(true);
        } finally {
            setCreating(false);
        }
    }
    return (
        <main className={styles.page}>
            <Link href={href('/workbooks')}>
                {workbookLabels(locale).title}
            </Link>
            <header className={styles.header}>
                <div>
                    <h1 className={styles.title}>{t('knowledge.title')}</h1>
                    <p className={styles.description}>
                        {t('knowledge.description')}
                    </p>
                </div>
                <Button
                    leadingIcon={<Plus aria-hidden size={18} />}
                    loading={creating}
                    onClick={create}
                >
                    {t('knowledge.newNote')}
                </Button>
            </header>
            {createError && (
                <InlineAlert tone='error'>
                    {t('knowledge.createError')}
                </InlineAlert>
            )}
            <div className={styles.filters}>
                <Input
                    label={t('knowledge.search')}
                    value={library.search}
                    maxLength={200}
                    leadingIcon={<Search aria-hidden size={18} />}
                    onChange={search}
                />
                <Select
                    label={t('knowledge.categories')}
                    value={library.category}
                    onChange={category}
                    options={categoryOptions}
                />
                <Select
                    label={t('knowledge.studiedLanguage')}
                    value={library.language}
                    onChange={language}
                    options={[
                        { value: '', label: t('knowledge.allLanguages') },
                        ...languageOptions,
                    ]}
                />
            </div>
            <LibraryResults library={library} />
            {library.notes.hasNextPage && (
                <Button
                    variant='secondary'
                    loading={library.notes.isFetchingNextPage}
                    onClick={more}
                >
                    {t('knowledge.loadMore')}
                </Button>
            )}
        </main>
    );
}

function LibraryResults({ library }: { library: Library }) {
    const { t } = useI18n();
    function reload() {
        void library.notes.refetch();
    }
    if (library.notes.isPending)
        return <LoadingState>{t('knowledge.loading')}</LoadingState>;
    if (library.notes.isError)
        return (
            <InlineAlert
                tone='error'
                actions={
                    <Button variant='secondary' onClick={reload}>
                        {t('knowledge.retry')}
                    </Button>
                }
            >
                {t('knowledge.loadError')}
            </InlineAlert>
        );
    const notes =
        library.notes.data?.pages.flatMap((page) => page.workspaces) ?? [];
    const hasFilters = Boolean(
        library.search || library.category || library.language,
    );
    if (!notes.length)
        return (
            <EmptyState
                title={t(
                    hasFilters ? 'knowledge.noResults' : 'knowledge.emptyTitle',
                )}
            >
                {!hasFilters && t('knowledge.emptyHelp')}
            </EmptyState>
        );
    return (
        <ul className={styles.notes}>
            {notes.map((note) => (
                <KnowledgeResult key={note.id} note={note} />
            ))}
        </ul>
    );
}

function KnowledgeResult({ note }: { note: KnowledgeWorkspaceSummary }) {
    const { t, href, formatDate } = useI18n();
    return (
        <li>
            <Link href={href(`/knowledge/${note.id}`)} className={styles.note}>
                <h2 dir='auto'>
                    {note.title.trim() || t('knowledge.untitled')}
                </h2>
                <div className={styles.categories}>
                    {note.status === 'draft' && (
                        <Badge>{t('knowledge.draft')}</Badge>
                    )}
                    {note.hasUnsavedChanges && (
                        <Badge>{t('knowledge.workingChanges')}</Badge>
                    )}
                </div>
                <div className={styles.meta}>
                    <time dateTime={note.updatedAt}>
                        {t('knowledge.updated', {
                            date: formatDate(note.updatedAt),
                        })}
                    </time>
                </div>
            </Link>
        </li>
    );
}
