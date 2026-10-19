'use client';
import { type ChangeEvent } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import {
    KnowledgeCategorySchema,
    type KnowledgeNote,
} from '@languon/contracts';
import { useSessionStore } from '@/fsd/entities/session';
import { knowledgeCategoryKeys } from '@/fsd/entities/knowledge';
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
    const { t, locale } = useI18n();
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
    return (
        <main className={styles.page}>
            <header>
                <h1 className={styles.title}>{t('knowledge.title')}</h1>
                <p className={styles.description}>
                    {t('knowledge.description')}
                </p>
            </header>
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
    const notes = library.notes.data?.pages.flatMap((page) => page.notes) ?? [];
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
                <KnowledgeResult
                    key={note.id}
                    note={note}
                    languages={library.languages.data?.languages ?? []}
                />
            ))}
        </ul>
    );
}

function KnowledgeResult({
    note,
    languages,
}: {
    note: KnowledgeNote;
    languages: NonNullable<Library['languages']['data']>['languages'];
}) {
    const { t, locale, href, formatDate } = useI18n();
    const language =
        languages.find((item) => item.tag === note.studiedLanguage)
            ?.displayNames[locale] ?? note.studiedLanguage;
    return (
        <li>
            <Link href={href(`/knowledge/${note.id}`)} className={styles.note}>
                <h2 dir='auto'>{note.title}</h2>
                <p className={styles.summary} dir='auto'>
                    {note.summary}
                </p>
                <div className={styles.categories}>
                    {note.categories.map((category) => (
                        <Badge key={category}>
                            {t(knowledgeCategoryKeys[category])}
                        </Badge>
                    ))}
                </div>
                <div className={styles.meta}>
                    <span>{language}</span>
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
