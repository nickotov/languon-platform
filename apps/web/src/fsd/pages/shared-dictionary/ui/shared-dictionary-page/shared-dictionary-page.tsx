'use client';

import type {
    LanguageCatalogEntry,
    PublicDictionary,
} from '@languon/contracts';
import {
    useInfiniteQuery,
    useMutation,
    useQuery,
    useQueryClient,
} from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import {
    authorshipMessageKey,
    dictionaryApi,
    DictionaryApiError,
    languageForRole,
    languageLabel,
} from '@/fsd/entities/dictionary';
import { useSessionStore } from '@/fsd/entities/session';
import { useAuth } from '@/fsd/features/auth';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Badge,
    Button,
    ButtonLink,
    Card,
    ErrorState,
    LoadingState,
} from '@/fsd/shared/ui';

import styles from './shared-dictionary-page.module.css';

function readFragmentKey(): string {
    return window.location.hash.startsWith('#')
        ? window.location.hash.slice(1)
        : '';
}

export function SharedDictionaryPage({ shareId }: { shareId: string }) {
    const { href, locale, t } = useI18n();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { requestWithSession } = useAuth();
    const sessionStatus = useSessionStore((state) => state.status);
    const [capability, setCapability] = useState<{
        key: string;
        revision: number;
    } | null>(null);
    const shareKey = capability?.key ?? null;
    const sharedQueryKey = [
        'shared-dictionary',
        shareId,
        capability?.revision ?? 0,
    ] as const;
    const forkIdempotencyKey = useRef(crypto.randomUUID());

    useEffect(() => {
        const update = () =>
            setCapability((current) => ({
                key: readFragmentKey(),
                revision: (current?.revision ?? 0) + 1,
            }));
        update();
        window.addEventListener('hashchange', update);
        return () => window.removeEventListener('hashchange', update);
    }, []);

    const shared = useInfiniteQuery({
        queryKey: sharedQueryKey,
        initialPageParam: undefined as string | undefined,
        queryFn: ({ pageParam, signal }) =>
            dictionaryApi.readSharedDictionary(
                shareId,
                shareKey!,
                {
                    limit: 25,
                    ...(pageParam ? { cursor: pageParam } : {}),
                },
                signal,
            ),
        getNextPageParam: (page) => page.nextCursor ?? undefined,
        enabled: Boolean(shareKey),
        retry: false,
        staleTime: 0,
        gcTime: 0,
    });
    const languages = useQuery({
        queryKey: ['dictionary-languages'],
        queryFn: ({ signal }) => dictionaryApi.listLanguages(signal),
        staleTime: Infinity,
    });
    const fork = useMutation({
        mutationFn: () =>
            requestWithSession((token) =>
                dictionaryApi.forkSharedDictionary(
                    token,
                    shareId,
                    shareKey!,
                    {},
                    forkIdempotencyKey.current,
                ),
            ),
        onSuccess: ({ dictionary }) =>
            router.push(href(`/dictionaries/${dictionary.id}`)),
    });

    if (
        shareKey === null ||
        (Boolean(shareKey) && shared.isPending) ||
        languages.isPending
    ) {
        return (
            <main className={styles.main}>
                <LoadingState>{t('dictionary.public.loading')}</LoadingState>
            </main>
        );
    }
    const unavailable = !shareKey || languages.isError || !shared.data;
    if (unavailable) {
        return (
            <main className={styles.main}>
                <ErrorState
                    action={
                        <ButtonLink href={href('/dictionaries')}>
                            {t('dictionary.backToLibrary')}
                        </ButtonLink>
                    }
                    title={t('dictionary.public.unavailable')}
                >
                    {t('dictionary.public.unavailableHelp')}
                </ErrorState>
            </main>
        );
    }
    const dictionary = shared.data.pages[0]!.dictionary;
    const cards = shared.data.pages.flatMap((page) => page.dictionary.cards);
    const catalog = languages.data.languages;
    const returnTo = `/shared/dictionaries/${shareId}`;
    const signInQuery = new URLSearchParams({ returnTo }).toString();
    const signInHref = `/login?${signInQuery}#${shareKey}`;

    return (
        <main className={styles.main}>
            <header className={styles.header}>
                <p className={styles.eyebrow}>
                    {t('dictionary.public.eyebrow')}
                </p>
                <h1>{dictionary.name}</h1>
                {dictionary.description ? (
                    <p>{dictionary.description}</p>
                ) : null}
                <p>
                    <span>
                        {languageLabel(
                            catalog,
                            dictionary.sourceLanguage,
                            locale,
                        )}
                    </span>{' '}
                    →{' '}
                    <span>
                        {languageLabel(
                            catalog,
                            dictionary.targetLanguage,
                            locale,
                        )}
                    </span>{' '}
                    ·{' '}
                    {t('dictionary.library.cardCount', {
                        count: dictionary.activeCardCount,
                    })}
                </p>
                <Badge tone='warning'>{t('dictionary.public.noIndex')}</Badge>
            </header>

            <Card className={styles.forkCard}>
                <h2>{t('dictionary.public.forkTitle')}</h2>
                <p>{t('dictionary.public.forkHelp')}</p>
                {sessionStatus === 'authenticated' ? (
                    <Button
                        loading={fork.isPending}
                        onClick={() => fork.mutate()}
                        type='button'
                    >
                        {t('dictionary.public.fork')}
                    </Button>
                ) : (
                    <ButtonLink href={href(signInHref)}>
                        {t('dictionary.public.signInToFork')}
                    </ButtonLink>
                )}
                {fork.error ? (
                    <p role='alert'>{t('dictionary.public.forkFailed')}</p>
                ) : null}
            </Card>

            <ol className={styles.cards}>
                {cards.map((card) => (
                    <li key={card.id}>
                        <PublicCard
                            card={card}
                            dictionary={dictionary}
                            languages={catalog}
                        />
                    </li>
                ))}
            </ol>
            {shared.hasNextPage ? (
                <Button
                    loading={shared.isFetchingNextPage}
                    onClick={() => void shared.fetchNextPage()}
                    type='button'
                    variant='secondary'
                >
                    {t('dictionary.cards.loadMore')}
                </Button>
            ) : null}
            {shared.isFetchNextPageError ? (
                <div role='alert'>
                    <p>{t('dictionary.public.loadMoreFailed')}</p>
                    {shared.error instanceof DictionaryApiError &&
                    shared.error.detail.code === 'version_conflict' ? (
                        <Button
                            onClick={() =>
                                void queryClient.resetQueries({
                                    exact: true,
                                    queryKey: sharedQueryKey,
                                })
                            }
                            type='button'
                            variant='secondary'
                        >
                            {t('dictionary.conflict.reload')}
                        </Button>
                    ) : null}
                </div>
            ) : null}
        </main>
    );
}

function PublicCard({
    card,
    dictionary,
    languages,
}: {
    card: PublicDictionary['cards'][number];
    dictionary: PublicDictionary;
    languages: readonly LanguageCatalogEntry[];
}) {
    const { t } = useI18n();
    const direction = (language: string) =>
        languages.find((candidate) => candidate.tag === language)?.direction ??
        'ltr';
    const optional = [
        card.effectiveSettings.transcriptionEnabled && card.values.transcription
            ? {
                  key: 'transcription',
                  label: t('dictionary.field.transcription'),
                  lang: dictionary.sourceLanguage,
                  value: card.values.transcription,
              }
            : null,
        card.effectiveSettings.definitionEnabled && card.values.definition
            ? {
                  key: 'definition',
                  label: t('dictionary.field.definition'),
                  lang: languageForRole(
                      card.effectiveSettings.definitionLanguage,
                      dictionary.sourceLanguage,
                      dictionary.targetLanguage,
                  ),
                  value: card.values.definition,
              }
            : null,
        card.effectiveSettings.exampleEnabled && card.values.example
            ? {
                  key: 'example',
                  label: t('dictionary.field.example'),
                  lang: languageForRole(
                      card.effectiveSettings.exampleLanguage,
                      dictionary.sourceLanguage,
                      dictionary.targetLanguage,
                  ),
                  value: card.values.example,
              }
            : null,
        card.effectiveSettings.exampleTranslationEnabled &&
        card.values.exampleTranslation
            ? {
                  key: 'exampleTranslation',
                  label: t('dictionary.field.exampleTranslation'),
                  lang: languageForRole(
                      card.effectiveSettings.exampleTranslationLanguage,
                      dictionary.sourceLanguage,
                      dictionary.targetLanguage,
                  ),
                  value: card.values.exampleTranslation,
              }
            : null,
    ].filter((value): value is NonNullable<typeof value> => value !== null);
    return (
        <Card className={styles.card}>
            <div className={styles.pair}>
                <strong
                    dir={direction(dictionary.sourceLanguage)}
                    lang={dictionary.sourceLanguage}
                >
                    {card.values.source}
                </strong>
                <span aria-hidden='true'>→</span>
                <strong
                    dir={direction(dictionary.targetLanguage)}
                    lang={dictionary.targetLanguage}
                >
                    {card.values.translation}
                </strong>
            </div>
            {optional.length ? (
                <dl>
                    {optional.map((field) => (
                        <div key={field.key}>
                            <dt>{field.label}</dt>
                            <dd dir={direction(field.lang)} lang={field.lang}>
                                {field.value}
                            </dd>
                        </div>
                    ))}
                </dl>
            ) : null}
            <Badge>{t(authorshipMessageKey(card.authorship))}</Badge>
        </Card>
    );
}
