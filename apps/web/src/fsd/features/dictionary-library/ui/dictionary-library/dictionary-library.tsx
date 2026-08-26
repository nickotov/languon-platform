'use client';

import type {
    CreateDictionaryRequest,
    DictionaryLifecycle,
    DictionaryImportTarget,
    ImportDictionaryRequest,
    LanguageCatalogEntry,
    PreviewDictionaryImportRequest,
    PreviewDictionaryImportResponse,
} from '@languon/contracts';
import {
    useInfiniteQuery,
    useMutation,
    useQuery,
    useQueryClient,
} from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type ComponentType, type FormEvent, useRef, useState } from 'react';

import {
    dictionaryApi,
    DictionaryApiError,
    dictionaryErrorMessage,
    languageLabel,
    type RequestWithSession,
} from '@/fsd/entities/dictionary';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Badge,
    BottomSheet,
    Button,
    ButtonLink,
    Card,
    Dialog,
    EmptyState,
    ErrorState,
    Field,
    Input,
    LoadingState,
    Select,
    Textarea,
} from '@/fsd/shared/ui';

import { retainIdempotencyAttempt } from '../../lib/idempotency-attempt';
import styles from './dictionary-library.module.css';

export function DictionaryLibrary({
    importPanel: ImportPanel,
    requestWithSession,
}: {
    importPanel: ComponentType<{
        aiAvailable: boolean;
        error?: string | null;
        languages: readonly LanguageCatalogEntry[];
        onCommit(request: ImportDictionaryRequest): Promise<void>;
        onPreview(request: PreviewDictionaryImportRequest): Promise<void>;
        optionalFieldsEnabled: boolean;
        pending: boolean;
        preview?: PreviewDictionaryImportResponse | null;
        sourceLanguage: string;
        target: DictionaryImportTarget;
        targetLanguage: string;
    }>;
    requestWithSession: RequestWithSession;
}) {
    const { formatDate, href, locale, t } = useI18n();
    const router = useRouter();
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const [lifecycle, setLifecycle] = useState<DictionaryLifecycle>('active');
    const [createOpen, setCreateOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [importName, setImportName] = useState('');
    const [importPreview, setImportPreview] =
        useState<PreviewDictionaryImportResponse | null>(null);
    const [createSourceLanguage, setCreateSourceLanguage] =
        useState<CreateDictionaryRequest['sourceLanguage']>('en');
    const [createTargetLanguage, setCreateTargetLanguage] =
        useState<CreateDictionaryRequest['targetLanguage']>('es');
    const [message, setMessage] = useState<string | null>(null);
    const createAttempt = useRef<{ fingerprint: string; key: string } | null>(
        null,
    );
    const importAttempt = useRef<{ fingerprint: string; key: string } | null>(
        null,
    );

    const languages = useQuery({
        queryKey: ['dictionary-languages'],
        queryFn: ({ signal }) => dictionaryApi.listLanguages(signal),
        staleTime: Infinity,
    });
    const dictionaries = useInfiniteQuery({
        queryKey: ['dictionaries', lifecycle, search],
        initialPageParam: undefined as string | undefined,
        queryFn: ({ pageParam, signal }) =>
            requestWithSession((token) =>
                dictionaryApi.listDictionaries(
                    token,
                    {
                        lifecycle,
                        limit: 25,
                        ...(pageParam ? { cursor: pageParam } : {}),
                        ...(search.trim() ? { search: search.trim() } : {}),
                    },
                    signal,
                ),
            ),
        getNextPageParam: (page) => page.nextCursor ?? undefined,
    });
    const generationCapabilities = useQuery({
        queryKey: ['dictionary-generation-capabilities'],
        queryFn: ({ signal }) =>
            requestWithSession((token) =>
                dictionaryApi.readGenerationCapabilities(token, signal),
            ),
    });

    const create = useMutation({
        mutationFn: (body: {
            description: string | null;
            name: string;
            sourceLanguage: string;
            targetLanguage: string;
        }) => {
            const fingerprint = JSON.stringify(body);
            createAttempt.current = retainIdempotencyAttempt(
                createAttempt.current,
                fingerprint,
            );
            return requestWithSession((token) =>
                dictionaryApi.createDictionary(
                    token,
                    body as Parameters<
                        typeof dictionaryApi.createDictionary
                    >[1],
                    createAttempt.current!.key,
                ),
            );
        },
        onSuccess: ({ dictionary }) => {
            createAttempt.current = null;
            void queryClient.invalidateQueries({ queryKey: ['dictionaries'] });
            setCreateOpen(false);
            router.push(href(`/dictionaries/${dictionary.id}`));
        },
    });

    const lifecycleMutation = useMutation({
        mutationFn: (input: {
            id: string;
            lifecycle: DictionaryLifecycle;
            version: number;
        }) =>
            requestWithSession((token) =>
                dictionaryApi.setDictionaryLifecycle(
                    token,
                    input.id,
                    input.lifecycle,
                    { expectedDictionaryVersion: input.version },
                ),
            ),
        onSuccess: (_, input) => {
            setMessage(
                input.lifecycle === 'archived'
                    ? t('dictionary.library.archivedOutcome')
                    : t('dictionary.library.restoredOutcome'),
            );
            void queryClient.invalidateQueries({ queryKey: ['dictionaries'] });
        },
    });
    const importPreviewMutation = useMutation({
        mutationFn: (body: PreviewDictionaryImportRequest) =>
            requestWithSession((token) =>
                dictionaryApi.previewImport(token, body),
            ),
        onSuccess: setImportPreview,
    });
    const importMutation = useMutation({
        mutationFn: (body: ImportDictionaryRequest) => {
            const fingerprint = JSON.stringify(body);
            importAttempt.current = retainIdempotencyAttempt(
                importAttempt.current,
                fingerprint,
            );
            return requestWithSession((token) =>
                dictionaryApi.importDictionary(
                    token,
                    body,
                    importAttempt.current!.key,
                ),
            );
        },
        onSuccess: (response) => {
            importAttempt.current = null;
            setImportOpen(false);
            setImportPreview(null);
            void queryClient.invalidateQueries({ queryKey: ['dictionaries'] });
            const suffix =
                response.mode === 'ai'
                    ? `?batchGenerationJob=${encodeURIComponent(response.job.id)}`
                    : '';
            router.push(
                href(`/dictionaries/${response.dictionary.id}${suffix}`),
            );
        },
    });

    function submitCreate(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        create.mutate({
            description: String(data.get('description') ?? '').trim() || null,
            name: String(data.get('name') ?? ''),
            sourceLanguage: String(data.get('sourceLanguage') ?? ''),
            targetLanguage: String(data.get('targetLanguage') ?? ''),
        });
    }

    const catalog = languages.data?.languages ?? [];
    const list = dictionaries.data?.pages.flatMap((page) => page.data) ?? [];
    const loadError =
        languages.error ?? (dictionaries.data ? null : dictionaries.error);
    async function reloadAfterLifecycleConflict() {
        lifecycleMutation.reset();
        await dictionaries.refetch();
    }

    return (
        <main className={styles.main}>
            <header className={styles.header}>
                <div>
                    <p className={styles.eyebrow}>
                        {t('dictionary.library.eyebrow')}
                    </p>
                    <h1>{t('dictionary.library.title')}</h1>
                </div>
                <div className={styles.actions}>
                    <Button
                        onClick={() => {
                            setImportOpen(true);
                            setImportPreview(null);
                        }}
                        type='button'
                        variant='secondary'
                    >
                        {t('dictionary.interchange.openImport')}
                    </Button>
                    <Button onClick={() => setCreateOpen(true)} type='button'>
                        {t('dictionary.library.create')}
                    </Button>
                </div>
            </header>

            <div className={styles.filters}>
                <Field label={t('dictionary.library.search')}>
                    <Input
                        onChange={(event) =>
                            setSearch(event.currentTarget.value)
                        }
                        type='search'
                        value={search}
                    />
                </Field>
                <Field label={t('dictionary.library.lifecycle')}>
                    <Select
                        onChange={(event) =>
                            setLifecycle(
                                event.currentTarget
                                    .value as DictionaryLifecycle,
                            )
                        }
                        value={lifecycle}
                    >
                        <option value='active'>
                            {t('dictionary.lifecycle.active')}
                        </option>
                        <option value='archived'>
                            {t('dictionary.lifecycle.archived')}
                        </option>
                    </Select>
                </Field>
            </div>

            <p aria-live='polite' className={styles.srOutcome}>
                {message}
            </p>
            {lifecycleMutation.error ? (
                <ErrorState
                    action={
                        lifecycleMutation.error instanceof DictionaryApiError &&
                        lifecycleMutation.error.detail.code ===
                            'version_conflict' ? (
                            <Button
                                onClick={() =>
                                    void reloadAfterLifecycleConflict()
                                }
                                type='button'
                            >
                                {t('dictionary.conflict.reload')}
                            </Button>
                        ) : undefined
                    }
                    title={t('dictionary.error.title')}
                >
                    {dictionaryErrorMessage(lifecycleMutation.error, t)}
                </ErrorState>
            ) : null}
            {loadError ? (
                <ErrorState
                    action={
                        <Button
                            onClick={() => {
                                void languages.refetch();
                                void dictionaries.refetch();
                            }}
                            type='button'
                        >
                            {t('common.retry')}
                        </Button>
                    }
                    title={t('dictionary.error.title')}
                >
                    {dictionaryErrorMessage(loadError, t)}
                </ErrorState>
            ) : dictionaries.isPending || languages.isPending ? (
                <LoadingState>{t('dictionary.library.loading')}</LoadingState>
            ) : list.length === 0 ? (
                <EmptyState
                    action={
                        search ? undefined : (
                            <Button
                                onClick={() => setCreateOpen(true)}
                                type='button'
                            >
                                {t('dictionary.library.createFirst')}
                            </Button>
                        )
                    }
                    title={
                        search
                            ? t('dictionary.library.noResults')
                            : lifecycle === 'archived'
                              ? t('dictionary.library.noArchived')
                              : t('dictionary.library.empty')
                    }
                >
                    {search
                        ? t('dictionary.library.noResultsHelp')
                        : t('dictionary.library.emptyHelp')}
                </EmptyState>
            ) : (
                <ul className={styles.list}>
                    {list.map((dictionary) => (
                        <li key={dictionary.id}>
                            <Card className={styles.dictionaryCard}>
                                <div className={styles.cardHeader}>
                                    <h2>{dictionary.name}</h2>
                                    <Badge
                                        tone={
                                            dictionary.lifecycle === 'archived'
                                                ? 'warning'
                                                : 'info'
                                        }
                                    >
                                        {t(
                                            `dictionary.visibility.${dictionary.visibility}`,
                                        )}
                                    </Badge>
                                </div>
                                <p>
                                    {languageLabel(
                                        catalog,
                                        dictionary.sourceLanguage,
                                        locale,
                                    )}{' '}
                                    →{' '}
                                    {languageLabel(
                                        catalog,
                                        dictionary.targetLanguage,
                                        locale,
                                    )}
                                </p>
                                <p className={styles.meta}>
                                    {t('dictionary.library.cardCount', {
                                        count: dictionary.activeCardCount,
                                    })}{' '}
                                    ·{' '}
                                    {t('dictionary.library.updated', {
                                        date: formatDate(dictionary.updatedAt),
                                    })}
                                </p>
                                <div className={styles.actions}>
                                    <ButtonLink
                                        href={href(
                                            `/dictionaries/${dictionary.id}`,
                                        )}
                                        variant='secondary'
                                    >
                                        {t('dictionary.library.open')}
                                    </ButtonLink>
                                    <Button
                                        disabled={
                                            lifecycleMutation.isPending ||
                                            dictionaries.isFetching
                                        }
                                        onClick={() =>
                                            lifecycleMutation.mutate({
                                                id: dictionary.id,
                                                lifecycle:
                                                    dictionary.lifecycle ===
                                                    'active'
                                                        ? 'archived'
                                                        : 'active',
                                                version: dictionary.version,
                                            })
                                        }
                                        type='button'
                                        variant={
                                            dictionary.lifecycle === 'active'
                                                ? 'danger'
                                                : 'quiet'
                                        }
                                    >
                                        {dictionary.lifecycle === 'active'
                                            ? t('dictionary.library.archive')
                                            : t('dictionary.library.restore')}
                                    </Button>
                                </div>
                            </Card>
                        </li>
                    ))}
                </ul>
            )}
            {dictionaries.isFetchNextPageError ? (
                <p role='alert'>{t('dictionary.library.loadMoreFailed')}</p>
            ) : null}
            {dictionaries.hasNextPage ? (
                <Button
                    loading={dictionaries.isFetchingNextPage}
                    onClick={() => void dictionaries.fetchNextPage()}
                    type='button'
                    variant='secondary'
                >
                    {dictionaries.isFetchNextPageError
                        ? t('dictionary.library.retryLoadMore')
                        : t('dictionary.library.loadMore')}
                </Button>
            ) : null}

            <Dialog
                closeLabel={t('dictionary.dialog.close')}
                description={t('dictionary.create.description')}
                onClose={() => setCreateOpen(false)}
                open={createOpen}
                title={t('dictionary.create.title')}
            >
                <form className={styles.form} onSubmit={submitCreate}>
                    <Field label={t('dictionary.field.name')} required>
                        <Input maxLength={120} name='name' required />
                    </Field>
                    <Field
                        label={t('dictionary.field.description')}
                        optionalLabel={t('dictionary.field.optional')}
                    >
                        <Textarea maxLength={2000} name='description' />
                    </Field>
                    <div className={styles.pair}>
                        <Field
                            label={t('dictionary.field.sourceLanguage')}
                            required
                        >
                            <Select
                                name='sourceLanguage'
                                onChange={(event) =>
                                    setCreateSourceLanguage(
                                        event.currentTarget
                                            .value as CreateDictionaryRequest['sourceLanguage'],
                                    )
                                }
                                required
                                value={createSourceLanguage}
                            >
                                {catalog.map((language) => (
                                    <option
                                        key={language.tag}
                                        value={language.tag}
                                    >
                                        {languageLabel(
                                            catalog,
                                            language.tag,
                                            locale,
                                        )}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                        <Field
                            label={t('dictionary.field.targetLanguage')}
                            required
                        >
                            <Select
                                name='targetLanguage'
                                onChange={(event) =>
                                    setCreateTargetLanguage(
                                        event.currentTarget
                                            .value as CreateDictionaryRequest['targetLanguage'],
                                    )
                                }
                                required
                                value={createTargetLanguage}
                            >
                                {catalog.map((language) => (
                                    <option
                                        key={language.tag}
                                        value={language.tag}
                                    >
                                        {languageLabel(
                                            catalog,
                                            language.tag,
                                            locale,
                                        )}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                    </div>
                    {create.error ? (
                        <p role='alert'>
                            {dictionaryErrorMessage(create.error, t)}
                        </p>
                    ) : null}
                    <div className={styles.actions}>
                        <Button
                            onClick={() => setCreateOpen(false)}
                            type='button'
                            variant='quiet'
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button loading={create.isPending} type='submit'>
                            {t('dictionary.create.submit')}
                        </Button>
                    </div>
                </form>
            </Dialog>
            <BottomSheet
                closeLabel={t('common.cancel')}
                dismissible={
                    !importPreviewMutation.isPending &&
                    !importMutation.isPending
                }
                onClose={() => {
                    setImportOpen(false);
                    setImportPreview(null);
                }}
                open={importOpen}
                size='large'
                title={t('dictionary.interchange.importTitle')}
            >
                {importOpen ? (
                    <div className={styles.form}>
                        <Field label={t('dictionary.field.name')} required>
                            <Input
                                maxLength={120}
                                onChange={(event) =>
                                    setImportName(event.currentTarget.value)
                                }
                                required
                                value={importName}
                            />
                        </Field>
                        <div className={styles.pair}>
                            <Field
                                label={t('dictionary.field.sourceLanguage')}
                                required
                            >
                                <Select
                                    onChange={(event) =>
                                        setCreateSourceLanguage(
                                            event.currentTarget
                                                .value as CreateDictionaryRequest['sourceLanguage'],
                                        )
                                    }
                                    value={createSourceLanguage}
                                >
                                    {catalog.map((language) => (
                                        <option
                                            key={language.tag}
                                            value={language.tag}
                                        >
                                            {languageLabel(
                                                catalog,
                                                language.tag,
                                                locale,
                                            )}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                            <Field
                                label={t('dictionary.field.targetLanguage')}
                                required
                            >
                                <Select
                                    onChange={(event) =>
                                        setCreateTargetLanguage(
                                            event.currentTarget
                                                .value as CreateDictionaryRequest['targetLanguage'],
                                        )
                                    }
                                    value={createTargetLanguage}
                                >
                                    {catalog.map((language) => (
                                        <option
                                            key={language.tag}
                                            value={language.tag}
                                        >
                                            {languageLabel(
                                                catalog,
                                                language.tag,
                                                locale,
                                            )}
                                        </option>
                                    ))}
                                </Select>
                            </Field>
                        </div>
                        <ImportPanel
                            aiAvailable={
                                generationCapabilities.data
                                    ?.importPairsGeneration.available === true
                            }
                            error={
                                importPreviewMutation.error
                                    ? dictionaryErrorMessage(
                                          importPreviewMutation.error,
                                          t,
                                      )
                                    : importMutation.error
                                      ? dictionaryErrorMessage(
                                            importMutation.error,
                                            t,
                                        )
                                      : null
                            }
                            languages={catalog}
                            onCommit={async (request) => {
                                await importMutation.mutateAsync(request);
                            }}
                            onPreview={async (request) => {
                                await importPreviewMutation.mutateAsync(
                                    request,
                                );
                            }}
                            optionalFieldsEnabled
                            pending={
                                importPreviewMutation.isPending ||
                                importMutation.isPending
                            }
                            preview={importPreview}
                            sourceLanguage={createSourceLanguage}
                            target={{
                                description: null,
                                kind: 'new',
                                name: importName,
                                sourceLanguage: createSourceLanguage,
                                targetLanguage: createTargetLanguage,
                            }}
                            targetLanguage={createTargetLanguage}
                        />
                    </div>
                ) : null}
            </BottomSheet>
        </main>
    );
}
