'use client';

import type {
    DictionaryCard,
    DictionaryCardAuthoringGenerationJob,
    DictionaryCardAuthoringSelectedSuggestion,
    DictionaryExportFormat,
    DictionaryGenerationCandidate,
    DictionaryLifecycle,
    ImportDictionaryRequest,
    PreviewDictionaryImportRequest,
    PreviewDictionaryImportResponse,
    DictionaryResponse,
} from '@languon/contracts';
import { documentIngestionLimitsV1 } from '@languon/contracts';
import {
    useInfiniteQuery,
    useMutation,
    useQuery,
    useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import {
    dictionaryApi,
    DictionaryApiError,
    dictionaryErrorMessage,
    languageLabel,
    type RequestWithSession,
} from '@/fsd/entities/dictionary';
import {
    DictionaryCardForm,
    type CardAuthoringIdempotencyAttempt,
    type DictionaryCardAuthoringAction,
    type DictionaryCardDraft,
    planCardAuthoringCleanup,
    resolveCardAuthoringCleanupRead,
    retainCardAuthoringIdempotencyAttempt,
} from '@/fsd/features/dictionary-card-authoring';
import {
    batchGenerationJobForDictionary,
    DictionaryBatchGenerationPanel,
} from '@/fsd/features/dictionary-batch-generation';
import { DictionaryCardList } from '@/fsd/features/dictionary-card-list';
import {
    type IdempotencyAttempt,
    retainIdempotencyAttempt,
} from '@/fsd/features/dictionary-library';
import {
    DictionaryGenerationPanel,
    isGenerationJobStale,
} from '@/fsd/features/dictionary-generation';
import {
    copyDictionaryExport,
    DictionaryExportSaveError,
    DictionaryExportPanel,
    DictionaryImportPanel,
    saveDictionaryExport,
} from '@/fsd/features/dictionary-interchange';
import {
    DictionaryDocumentGenerationPanel,
    documentGenerationJobForDictionary,
    documentMediaTypeForFile,
    fileSha256,
} from '@/fsd/features/dictionary-document-generation';
import { DictionarySettingsForm } from '@/fsd/features/dictionary-settings';
import { DictionarySharing } from '@/fsd/features/dictionary-sharing';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Badge,
    BottomSheet,
    Button,
    ButtonLink,
    EmptyState,
    ErrorState,
    Field,
    Input,
    InlineAlert,
    LoadingState,
    Select,
} from '@/fsd/shared/ui';

import styles from './dictionary-editor.module.css';

export function DictionaryEditor({
    dictionaryId,
    requestWithSession,
}: {
    dictionaryId: string;
    requestWithSession: RequestWithSession;
}) {
    const { href, locale, t } = useI18n();
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const [cardLifecycle, setCardLifecycle] =
        useState<DictionaryLifecycle>('active');
    const [editing, setEditing] = useState<DictionaryCard | 'new' | null>(null);
    const [authoringJobId, setAuthoringJobId] = useState<string | null>(null);
    const [authoringReviewJob, setAuthoringReviewJob] =
        useState<DictionaryCardAuthoringGenerationJob | null>(null);
    const [generationTarget, setGenerationTarget] = useState<{
        cardId: string;
        jobId?: string | undefined;
    } | null>(null);
    const [generationCompared, setGenerationCompared] = useState(false);
    const [batchGenerationOpen, setBatchGenerationOpen] = useState(false);
    const [batchGenerationJobId, setBatchGenerationJobId] = useState<
        string | null
    >(null);
    const [documentGenerationOpen, setDocumentGenerationOpen] = useState(false);
    const [documentGenerationJobId, setDocumentGenerationJobId] = useState<
        string | null
    >(null);
    const [interchangeOpen, setInterchangeOpen] = useState<
        'export' | 'import' | null
    >(null);
    const [interchangePreview, setInterchangePreview] =
        useState<PreviewDictionaryImportResponse | null>(null);
    const [outcome, setOutcome] = useState('');
    const batchEnqueueAttempt = useRef<IdempotencyAttempt | null>(null);
    const documentRetryAttempt = useRef<IdempotencyAttempt | null>(null);
    const documentUploadAttempt = useRef<IdempotencyAttempt | null>(null);
    const interchangeAttempt = useRef<IdempotencyAttempt | null>(null);
    const authoringAttempt = useRef<CardAuthoringIdempotencyAttempt | null>(
        null,
    );
    const authoringCleanup = useRef({
        cancelJobIds: new Set<string>(),
        discardJobIds: new Set<string>(),
    });
    const authoringCleanupInFlight = useRef<Promise<void> | null>(null);
    const authoringCleanupRequested = useRef(false);
    const cardsQueryKey = [
        'dictionary-cards',
        dictionaryId,
        cardLifecycle,
        search,
    ] as const;

    function flushCardAuthoringCleanup(): Promise<void> {
        if (authoringCleanupInFlight.current) {
            authoringCleanupRequested.current = true;
            return authoringCleanupInFlight.current;
        }
        const cleanup = async () => {
            do {
                authoringCleanupRequested.current = false;
                for (const jobId of [
                    ...authoringCleanup.current.cancelJobIds,
                ]) {
                    try {
                        await requestWithSession((token) =>
                            dictionaryApi.cancelGenerationJob(token, jobId),
                        );
                        authoringCleanup.current.cancelJobIds.delete(jobId);
                    } catch {
                        try {
                            const { job } = await requestWithSession((token) =>
                                dictionaryApi.readGenerationJob(token, jobId),
                            );
                            if (job.kind !== 'card-authoring') continue;
                            const resolution =
                                resolveCardAuthoringCleanupRead(job);
                            if (resolution === 'discard') {
                                authoringCleanup.current.cancelJobIds.delete(
                                    jobId,
                                );
                                authoringCleanup.current.discardJobIds.add(
                                    jobId,
                                );
                            } else if (resolution === 'complete') {
                                authoringCleanup.current.cancelJobIds.delete(
                                    jobId,
                                );
                            }
                        } catch {
                            // Retain the ID for the next bounded retry.
                        }
                    }
                }
                for (const jobId of [
                    ...authoringCleanup.current.discardJobIds,
                ]) {
                    try {
                        await requestWithSession((token) =>
                            dictionaryApi.discardGenerationJob(token, jobId),
                        );
                        authoringCleanup.current.discardJobIds.delete(jobId);
                    } catch {
                        try {
                            const { job } = await requestWithSession((token) =>
                                dictionaryApi.readGenerationJob(token, jobId),
                            );
                            if (
                                job.kind === 'card-authoring' &&
                                resolveCardAuthoringCleanupRead(job) ===
                                    'complete'
                            )
                                authoringCleanup.current.discardJobIds.delete(
                                    jobId,
                                );
                        } catch {
                            // Keep the review ID for the next bounded retry.
                        }
                    }
                }
            } while (authoringCleanupRequested.current);
        };
        const running = cleanup().finally(() => {
            authoringCleanupInFlight.current = null;
        });
        authoringCleanupInFlight.current = running;
        return running;
    }

    function queueCardAuthoringCleanup(): Promise<void> {
        const plan = planCardAuthoringCleanup(
            authoringJob.data,
            authoringReviewJob,
        );
        plan.cancelJobIds.forEach((jobId) =>
            authoringCleanup.current.cancelJobIds.add(jobId),
        );
        plan.discardJobIds.forEach((jobId) =>
            authoringCleanup.current.discardJobIds.add(jobId),
        );
        return flushCardAuthoringCleanup();
    }

    useEffect(() => {
        const retry = () => void flushCardAuthoringCleanup();
        window.addEventListener('online', retry);
        return () => window.removeEventListener('online', retry);
    }, []);

    const languages = useQuery({
        queryKey: ['dictionary-languages'],
        queryFn: ({ signal }) => dictionaryApi.listLanguages(signal),
        staleTime: Infinity,
    });
    const dictionary = useQuery({
        queryKey: ['dictionary', dictionaryId],
        queryFn: ({ signal }) =>
            requestWithSession((token) =>
                dictionaryApi.readDictionary(token, dictionaryId, signal),
            ),
    });
    const cards = useInfiniteQuery({
        queryKey: cardsQueryKey,
        initialPageParam: undefined as string | undefined,
        queryFn: ({ pageParam, signal }) =>
            requestWithSession((token) =>
                dictionaryApi.listCards(
                    token,
                    dictionaryId,
                    {
                        lifecycle: cardLifecycle,
                        limit: 50,
                        ...(pageParam ? { cursor: pageParam } : {}),
                        ...(search.trim() ? { search: search.trim() } : {}),
                    },
                    signal,
                ),
            ),
        getNextPageParam: (page) => page.nextCursor ?? undefined,
        enabled: dictionary.isSuccess,
    });
    const generationCapabilities = useQuery({
        queryKey: ['dictionary-generation-capabilities'],
        queryFn: ({ signal }) =>
            requestWithSession((token) =>
                dictionaryApi.readGenerationCapabilities(token, signal),
            ),
        staleTime: 30_000,
    });
    const authoringJob = useQuery({
        queryKey: ['dictionary-card-authoring-job', authoringJobId],
        queryFn: async ({ signal }) => {
            const response = await requestWithSession((token) =>
                dictionaryApi.readGenerationJob(token, authoringJobId!, signal),
            );
            return response.job.kind === 'card-authoring' ? response.job : null;
        },
        enabled: editing === 'new' && authoringJobId !== null,
        refetchInterval: (query) => {
            const state = query.state.data?.state;
            return state === 'queued' || state === 'running' ? 1_000 : false;
        },
    });
    useEffect(() => {
        if (authoringJob.data?.state === 'review') {
            setAuthoringReviewJob(authoringJob.data);
        }
    }, [authoringJob.data]);
    useEffect(() => {
        const url = new URL(window.location.href);
        const cardId = url.searchParams.get('generationCard');
        const jobId = url.searchParams.get('generationJob');
        const batchJobId = url.searchParams.get('batchGenerationJob');
        const documentJobId = url.searchParams.get('documentGenerationJob');
        if (cardId && UUID_PATTERN.test(cardId)) {
            setGenerationTarget({
                cardId,
                ...(jobId && UUID_PATTERN.test(jobId) ? { jobId } : {}),
            });
        }
        if (batchJobId && UUID_PATTERN.test(batchJobId)) {
            setBatchGenerationJobId(batchJobId);
            setBatchGenerationOpen(true);
        }
        if (documentJobId && UUID_PATTERN.test(documentJobId)) {
            setDocumentGenerationJobId(documentJobId);
            setDocumentGenerationOpen(true);
        }
    }, []);
    const batchGenerationJob = useQuery({
        queryKey: ['dictionary-batch-generation-job', batchGenerationJobId],
        queryFn: async ({ signal }) => {
            const response = await requestWithSession((token) =>
                dictionaryApi.readGenerationJob(
                    token,
                    batchGenerationJobId!,
                    signal,
                ),
            );
            return {
                job: batchGenerationJobForDictionary(
                    response.job,
                    dictionaryId,
                ),
            };
        },
        enabled: batchGenerationOpen && batchGenerationJobId !== null,
        refetchInterval: (query) => {
            const state = query.state.data?.job?.state;
            return state === 'queued' || state === 'running' ? 1_000 : false;
        },
    });
    useEffect(() => {
        if (
            batchGenerationJobId &&
            batchGenerationJob.isSuccess &&
            batchGenerationJob.data.job === null
        ) {
            setBatchGenerationJobId(null);
            syncBatchGenerationUrl(null);
        }
    }, [
        batchGenerationJob.data?.job,
        batchGenerationJob.isSuccess,
        batchGenerationJobId,
    ]);
    const documentGenerationJob = useQuery({
        queryKey: [
            'dictionary-document-generation-job',
            documentGenerationJobId,
        ],
        queryFn: async ({ signal }) => {
            const response = await requestWithSession((token) =>
                dictionaryApi.readGenerationJob(
                    token,
                    documentGenerationJobId!,
                    signal,
                ),
            );
            return {
                job: documentGenerationJobForDictionary(
                    response.job,
                    dictionaryId,
                ),
            };
        },
        enabled: documentGenerationOpen && documentGenerationJobId !== null,
        refetchInterval: (query) => {
            const state = query.state.data?.job?.state;
            return state === 'awaiting-upload' ||
                state === 'queued' ||
                state === 'running'
                ? 1_000
                : false;
        },
    });
    useEffect(() => {
        if (
            documentGenerationJobId &&
            documentGenerationJob.isSuccess &&
            documentGenerationJob.data.job === null
        ) {
            setDocumentGenerationJobId(null);
            syncDocumentGenerationUrl(null);
        }
    }, [
        documentGenerationJob.data?.job,
        documentGenerationJob.isSuccess,
        documentGenerationJobId,
    ]);
    const generationJob = useQuery({
        queryKey: [
            'dictionary-generation-job',
            dictionaryId,
            generationTarget?.cardId,
            generationTarget?.jobId,
        ],
        queryFn: async ({ signal }) => {
            if (!generationTarget) return { job: null };
            if (!generationTarget.jobId) {
                return requestWithSession((token) =>
                    dictionaryApi.readLatestCardGeneration(
                        token,
                        dictionaryId,
                        generationTarget.cardId,
                        signal,
                    ),
                );
            }
            const response = await requestWithSession((token) =>
                dictionaryApi.readGenerationJob(
                    token,
                    generationTarget.jobId!,
                    signal,
                ),
            );
            return {
                job: response.job.kind === 'single-card' ? response.job : null,
            };
        },
        enabled: generationTarget !== null,
        refetchInterval: (query) => {
            const state = query.state.data?.job?.state;
            return state === 'queued' || state === 'running' ? 1_000 : false;
        },
    });
    const generationCard = useQuery({
        queryKey: [
            'dictionary-generation-card',
            dictionaryId,
            generationTarget?.cardId,
        ],
        queryFn: ({ signal }) =>
            requestWithSession((token) =>
                dictionaryApi.readCard(
                    token,
                    dictionaryId,
                    generationTarget!.cardId,
                    signal,
                ),
            ),
        enabled: generationTarget !== null,
    });
    useEffect(() => {
        const job = generationJob.data?.job;
        if (
            !job ||
            job.kind !== 'single-card' ||
            generationTarget?.jobId === job.id
        )
            return;
        const nextTarget = { cardId: job.cardId, jobId: job.id };
        setGenerationTarget(nextTarget);
        syncGenerationUrl(nextTarget);
    }, [generationJob.data?.job, generationTarget?.jobId]);

    const updateSettings = useMutation({
        mutationFn: async (
            values: Parameters<
                typeof DictionarySettingsForm
            >[0]['onSave'] extends (value: infer V) => unknown
                ? V
                : never,
        ) => {
            const current = dictionary.data?.dictionary;
            if (!current) throw new Error('Dictionary unavailable');
            const response = await requestWithSession((token) =>
                dictionaryApi.updateDictionary(token, dictionaryId, {
                    ...values,
                    expectedDictionaryVersion: current.version,
                    expectedSettingsVersion: current.settings.version,
                }),
            );
            queryClient.setQueryData(['dictionary', dictionaryId], response);
            await Promise.all([
                queryClient.invalidateQueries({
                    queryKey: ['dictionary-cards', dictionaryId],
                }),
                queryClient.invalidateQueries({ queryKey: ['dictionaries'] }),
            ]);
        },
    });

    const lifecycle = useMutation({
        mutationFn: async (next: DictionaryLifecycle) => {
            const current = dictionary.data?.dictionary;
            if (!current) throw new Error('Dictionary unavailable');
            return requestWithSession((token) =>
                dictionaryApi.setDictionaryLifecycle(
                    token,
                    dictionaryId,
                    next,
                    {
                        expectedDictionaryVersion: current.version,
                    },
                ),
            );
        },
        onSuccess: (response, next) => {
            queryClient.setQueryData(['dictionary', dictionaryId], response);
            void queryClient.invalidateQueries({ queryKey: ['dictionaries'] });
            setOutcome(
                next === 'archived'
                    ? t('dictionary.library.archivedOutcome')
                    : t('dictionary.library.restoredOutcome'),
            );
        },
    });

    const cardMutation = useMutation({
        mutationFn: async (input: {
            card?: DictionaryCard;
            draft: DictionaryCardDraft;
        }) => {
            const current = dictionary.data?.dictionary;
            const versions = cards.data?.pages[0];
            if (!current || !versions)
                throw new Error('Dictionary unavailable');
            if (input.card) {
                return requestWithSession((token) =>
                    dictionaryApi.updateCard(
                        token,
                        dictionaryId,
                        input.card!.id,
                        {
                            expectedCardVersion: input.card!.version,
                            expectedDictionaryVersion:
                                versions.dictionaryVersion,
                            expectedSettingsVersion: versions.settingsVersion,
                            ...input.draft,
                        },
                    ),
                );
            }
            return requestWithSession((token) =>
                dictionaryApi.createCard(token, dictionaryId, {
                    expectedDictionaryVersion: versions.dictionaryVersion,
                    expectedSettingsVersion: versions.settingsVersion,
                    ...input.draft,
                }),
            );
        },
        onSuccess: async (response, input) => {
            setGenerationCompared(false);
            if (!input.card) {
                await queueCardAuthoringCleanup();
                setAuthoringJobId(null);
                setAuthoringReviewJob(null);
                authoringAttempt.current = null;
            }
            setEditing((currentEditing) => {
                if (input.card) {
                    return currentEditing !== 'new' &&
                        currentEditing?.id === input.card.id
                        ? null
                        : currentEditing;
                }
                return currentEditing === 'new' ? null : currentEditing;
            });
            setOutcome(
                response.duplicateSource
                    ? t('dictionary.card.savedDuplicate')
                    : t('dictionary.card.saved'),
            );
            await Promise.all([
                queryClient.invalidateQueries({
                    queryKey: ['dictionary-cards', dictionaryId],
                }),
                queryClient.invalidateQueries({
                    queryKey: ['dictionary', dictionaryId],
                }),
                queryClient.invalidateQueries({ queryKey: ['dictionaries'] }),
            ]);
        },
    });

    const cardAuthoringAction = useMutation({
        mutationFn: async (
            action:
                | DictionaryCardAuthoringAction
                | {
                      draft: DictionaryCardDraft;
                      kind: 'accept';
                      selectedSuggestions: DictionaryCardAuthoringSelectedSuggestion[];
                  },
        ) => {
            const versions = cards.data?.pages[0];
            if (!versions) throw new Error('Dictionary unavailable');
            if (action.kind === 'cancel') {
                if (!authoringJobId)
                    throw new Error('Card authoring job unavailable');
                return requestWithSession((token) =>
                    dictionaryApi.cancelGenerationJob(token, authoringJobId),
                );
            }
            if (action.kind === 'accept') {
                if (!authoringReviewJob)
                    throw new Error('Card authoring proposal unavailable');
                return requestWithSession((token) =>
                    dictionaryApi.acceptGenerationJob(
                        token,
                        authoringReviewJob.id,
                        {
                            candidate: action.draft,
                            format: 'card-authoring:v1',
                            selectedSuggestions: action.selectedSuggestions,
                        },
                    ),
                );
            }

            const bodyDraft = {
                overrides: action.draft.overrides,
                values: {
                    definition: action.draft.values.definition,
                    example: action.draft.values.example,
                    exampleTranslation: action.draft.values.exampleTranslation,
                    transcription: action.draft.values.transcription,
                    translation: action.draft.values.translation.trim() || null,
                },
            };
            const source = action.draft.values.source.trim();
            const base = {
                draft: bodyDraft,
                expectedDictionaryVersion: versions.dictionaryVersion,
                expectedSettingsVersion: versions.settingsVersion,
                source,
            };
            const fingerprint = JSON.stringify({
                dictionaryId,
                predecessorId: action.successor ? authoringReviewJob?.id : null,
                request: action.successor
                    ? {
                          ...base,
                          discardedSuggestionIds: action.discardedSuggestionIds,
                          format: 'card-authoring:v1',
                          scope: action.scope,
                      }
                    : { ...base, scope: { kind: 'all' } },
            });
            const attempt = retainCardAuthoringIdempotencyAttempt(
                authoringAttempt.current,
                fingerprint,
            );
            authoringAttempt.current = attempt;
            const response = await requestWithSession((token) => {
                if (action.successor) {
                    if (!authoringReviewJob)
                        throw new Error('Card authoring proposal unavailable');
                    return dictionaryApi.regenerateCardAuthoringGeneration(
                        token,
                        authoringReviewJob.id,
                        {
                            ...base,
                            discardedSuggestionIds:
                                action.discardedSuggestionIds,
                            format: 'card-authoring:v1',
                            scope: action.scope,
                        },
                        attempt.key,
                    );
                }
                return dictionaryApi.enqueueCardAuthoringGeneration(
                    token,
                    dictionaryId,
                    { ...base, scope: { kind: 'all' } },
                    attempt.key,
                );
            });
            authoringAttempt.current = null;
            return response;
        },
        onSuccess: async (response) => {
            if (response.job.kind !== 'card-authoring') return;
            if (response.job.state === 'accepted') {
                setEditing(null);
                setAuthoringJobId(null);
                setAuthoringReviewJob(null);
                setOutcome(
                    'outcome' in response &&
                        typeof response.outcome === 'object' &&
                        response.outcome !== null &&
                        'duplicateSource' in response.outcome &&
                        response.outcome.duplicateSource
                        ? t('dictionary.card.savedDuplicate')
                        : t('dictionary.card.saved'),
                );
                await Promise.all([
                    queryClient.invalidateQueries({
                        queryKey: ['dictionary-cards', dictionaryId],
                    }),
                    queryClient.invalidateQueries({
                        queryKey: ['dictionary', dictionaryId],
                    }),
                    queryClient.invalidateQueries({
                        queryKey: ['dictionaries'],
                    }),
                ]);
                return;
            }
            setAuthoringJobId(response.job.id);
            queryClient.setQueryData(
                ['dictionary-card-authoring-job', response.job.id],
                response.job,
            );
            if (response.job.state === 'review')
                setAuthoringReviewJob(response.job);
        },
    });

    const cardLifecycleMutation = useMutation({
        mutationFn: async (card: DictionaryCard) => {
            const versions = cards.data?.pages[0];
            if (!versions) throw new Error('Dictionary unavailable');
            return requestWithSession((token) =>
                dictionaryApi.setCardLifecycle(
                    token,
                    dictionaryId,
                    card.id,
                    card.lifecycle === 'active' ? 'archived' : 'active',
                    {
                        expectedCardVersion: card.version,
                        expectedDictionaryVersion: versions.dictionaryVersion,
                    },
                ),
            );
        },
        onSuccess: async (_, card) => {
            setOutcome(
                card.lifecycle === 'active'
                    ? t('dictionary.cards.archivedOutcome')
                    : t('dictionary.cards.restoredOutcome'),
            );
            await Promise.all([
                queryClient.invalidateQueries({
                    queryKey: ['dictionary-cards', dictionaryId],
                }),
                queryClient.invalidateQueries({
                    queryKey: ['dictionary', dictionaryId],
                }),
                queryClient.invalidateQueries({ queryKey: ['dictionaries'] }),
            ]);
        },
    });

    const reorder = useMutation({
        mutationFn: async ({
            card,
            direction,
        }: {
            card: DictionaryCard;
            direction: -1 | 1;
        }) => {
            const page = cards.data?.pages[0];
            const ordered =
                cards.data?.pages.flatMap((entry) => entry.data) ?? [];
            if (!page) throw new Error('Dictionary unavailable');
            const from = ordered.findIndex((entry) => entry.id === card.id);
            const to = from + direction;
            if (from < 0 || to < 0 || to >= ordered.length) return;
            const ids = ordered.map((entry) => entry.id);
            [ids[from], ids[to]] = [ids[to]!, ids[from]!];
            await requestWithSession((token) =>
                dictionaryApi.reorderCards(token, dictionaryId, {
                    expectedDictionaryVersion: page.dictionaryVersion,
                    orderedCardIds: ids,
                }),
            );
        },
        onSuccess: async () => {
            setOutcome(t('dictionary.cards.reordered'));
            await Promise.all([
                cards.refetch(),
                queryClient.invalidateQueries({
                    queryKey: ['dictionary', dictionaryId],
                }),
                queryClient.invalidateQueries({ queryKey: ['dictionaries'] }),
            ]);
        },
    });

    const share = useMutation({
        mutationFn: async (operation: 'revoke' | 'rotate') => {
            const current = dictionary.data?.dictionary;
            if (!current) throw new Error('Dictionary unavailable');
            if (operation === 'rotate') {
                return requestWithSession((token) =>
                    dictionaryApi.rotateShareKey(token, dictionaryId, {
                        expectedDictionaryVersion: current.version,
                    }),
                );
            }
            const response = await requestWithSession((token) =>
                dictionaryApi.updateDictionary(token, dictionaryId, {
                    expectedDictionaryVersion: current.version,
                    visibility: 'private',
                }),
            );
            return { capability: null, dictionary: response.dictionary };
        },
        onSuccess: (response) => {
            queryClient.setQueryData<DictionaryResponse>(
                ['dictionary', dictionaryId],
                { dictionary: response.dictionary },
            );
            void queryClient.invalidateQueries({ queryKey: ['dictionaries'] });
        },
    });

    const generationAction = useMutation({
        mutationFn: async (
            action:
                | { kind: 'accept'; candidate: DictionaryGenerationCandidate }
                | { kind: 'cancel' }
                | { kind: 'discard' }
                | { kind: 'regenerate' | 'start'; instruction?: string },
        ) => {
            const currentDictionary = dictionary.data?.dictionary;
            if (!generationTarget || !currentDictionary)
                throw new Error('Dictionary generation unavailable');
            if (action.kind === 'cancel') {
                const jobId = generationJob.data?.job?.id;
                if (!jobId) throw new Error('Generation job unavailable');
                return requestWithSession((token) =>
                    dictionaryApi.cancelGenerationJob(token, jobId),
                );
            }
            if (action.kind === 'discard') {
                const jobId = generationJob.data?.job?.id;
                if (!jobId) throw new Error('Generation job unavailable');
                return requestWithSession((token) =>
                    dictionaryApi.discardGenerationJob(token, jobId),
                );
            }
            if (action.kind === 'accept') {
                const jobId = generationJob.data?.job?.id;
                if (!jobId) throw new Error('Generation job unavailable');
                return requestWithSession((token) =>
                    dictionaryApi.acceptGenerationJob(token, jobId, {
                        candidate: action.candidate,
                    }),
                );
            }
            const currentCardResponse = await requestWithSession((token) =>
                dictionaryApi.readCard(
                    token,
                    dictionaryId,
                    generationTarget.cardId,
                ),
            );
            const currentCard = currentCardResponse.card;
            const body = {
                expectedCardVersion: currentCard.version,
                expectedDictionaryVersion:
                    currentCardResponse.dictionaryVersion,
                expectedSettingsVersion: currentCard.settingsVersion,
                instruction:
                    'instruction' in action
                        ? (action.instruction ?? null)
                        : null,
            };
            if (action.kind === 'regenerate') {
                const jobId = generationJob.data?.job?.id;
                if (!jobId) throw new Error('Generation job unavailable');
                return requestWithSession((token) =>
                    dictionaryApi.regenerateGenerationJob(
                        token,
                        jobId,
                        body,
                        crypto.randomUUID(),
                    ),
                );
            }
            return requestWithSession((token) =>
                dictionaryApi.enqueueCardGeneration(
                    token,
                    dictionaryId,
                    currentCard.id,
                    body,
                    crypto.randomUUID(),
                ),
            );
        },
        onSuccess: async (response) => {
            if (response.job.kind !== 'single-card') return;
            const cardId = response.job.cardId;
            const nextTarget = { cardId, jobId: response.job.id };
            setGenerationTarget(nextTarget);
            syncGenerationUrl(nextTarget);
            queryClient.setQueryData(
                [
                    'dictionary-generation-job',
                    dictionaryId,
                    cardId,
                    response.job.id,
                ],
                { job: response.job },
            );
            if (response.job.state === 'accepted') {
                setOutcome(t('dictionary.generation.state.accepted'));
                await Promise.all([
                    queryClient.invalidateQueries({
                        queryKey: ['dictionary-cards', dictionaryId],
                    }),
                    queryClient.invalidateQueries({
                        queryKey: ['dictionary', dictionaryId],
                    }),
                    queryClient.invalidateQueries({
                        queryKey: ['dictionaries'],
                    }),
                ]);
            }
        },
    });

    const batchGenerationAction = useMutation({
        mutationFn: async (
            action:
                | {
                      kind: 'accept';
                      selected: readonly {
                          candidate: DictionaryGenerationCandidate;
                          rowIndex: number;
                      }[];
                  }
                | { kind: 'cancel' | 'discard' }
                | { context?: string; kind: 'start'; text: string }
                | {
                      kind: 'retry-failures';
                      rowIndexes: readonly number[];
                  },
        ) => {
            const versions = cards.data?.pages[0];
            if (!versions) throw new Error('Dictionary unavailable');
            if (action.kind === 'accept') {
                if (!batchGenerationJobId)
                    throw new Error('Batch generation job unavailable');
                const format = batchGenerationJob.data?.job?.format;
                if (
                    format !== 'pasted-terms:v1' &&
                    format !== 'import-pairs:v1'
                )
                    throw new Error('Batch generation job unavailable');
                return requestWithSession((token) =>
                    dictionaryApi.acceptGenerationJob(
                        token,
                        batchGenerationJobId,
                        {
                            format,
                            selected: [...action.selected],
                        },
                    ),
                );
            }
            if (action.kind === 'cancel' || action.kind === 'discard') {
                if (!batchGenerationJobId)
                    throw new Error('Batch generation job unavailable');
                return requestWithSession((token) =>
                    action.kind === 'cancel'
                        ? dictionaryApi.cancelGenerationJob(
                              token,
                              batchGenerationJobId,
                          )
                        : dictionaryApi.discardGenerationJob(
                              token,
                              batchGenerationJobId,
                          ),
                );
            }
            if (action.kind === 'retry-failures') {
                if (!batchGenerationJobId)
                    throw new Error('Batch generation job unavailable');
                const rowIndexes = [...action.rowIndexes].sort(
                    (left, right) => left - right,
                );
                const fingerprint = JSON.stringify({
                    expectedDictionaryVersion: versions.dictionaryVersion,
                    expectedSettingsVersion: versions.settingsVersion,
                    jobId: batchGenerationJobId,
                    rowIndexes,
                });
                const attempt = retainIdempotencyAttempt(
                    batchEnqueueAttempt.current,
                    fingerprint,
                );
                batchEnqueueAttempt.current = attempt;
                const retryBody = {
                    expectedDictionaryVersion: versions.dictionaryVersion,
                    expectedSettingsVersion: versions.settingsVersion,
                    rowIndexes,
                };
                const response =
                    batchGenerationJob.data?.job?.kind === 'import-pairs'
                        ? await requestWithSession((token) =>
                              dictionaryApi.retryImportPairsGeneration(
                                  token,
                                  batchGenerationJobId,
                                  retryBody,
                                  attempt.key,
                              ),
                          )
                        : await requestWithSession((token) =>
                              dictionaryApi.retryPastedTermsGeneration(
                                  token,
                                  batchGenerationJobId,
                                  retryBody,
                                  attempt.key,
                              ),
                          );
                batchEnqueueAttempt.current = null;
                return response;
            }
            const text = action.kind === 'start' ? action.text : '';
            const context =
                action.kind === 'start' ? (action.context ?? null) : null;
            const attempt = retainIdempotencyAttempt(
                batchEnqueueAttempt.current,
                JSON.stringify({
                    context,
                    dictionaryId,
                    expectedDictionaryVersion: versions.dictionaryVersion,
                    expectedSettingsVersion: versions.settingsVersion,
                    text,
                }),
            );
            batchEnqueueAttempt.current = attempt;
            const response = await requestWithSession((token) =>
                dictionaryApi.enqueuePastedTermsGeneration(
                    token,
                    dictionaryId,
                    {
                        context,
                        expectedDictionaryVersion: versions.dictionaryVersion,
                        expectedSettingsVersion: versions.settingsVersion,
                        text,
                    },
                    attempt.key,
                ),
            );
            batchEnqueueAttempt.current = null;
            return response;
        },
        onSuccess: async (response) => {
            if (
                response.job.kind !== 'pasted-terms' &&
                response.job.kind !== 'import-pairs'
            )
                return;
            setBatchGenerationJobId(response.job.id);
            syncBatchGenerationUrl(response.job.id);
            queryClient.setQueryData(
                ['dictionary-batch-generation-job', response.job.id],
                { job: response.job },
            );
            if (response.job.state === 'accepted') {
                setOutcome(
                    t('dictionary.batch.saved', {
                        count: response.job.outcome?.cards.length ?? 0,
                    }),
                );
                await Promise.all([
                    queryClient.invalidateQueries({
                        queryKey: ['dictionary-cards', dictionaryId],
                    }),
                    queryClient.invalidateQueries({
                        queryKey: ['dictionary', dictionaryId],
                    }),
                    queryClient.invalidateQueries({
                        queryKey: ['dictionaries'],
                    }),
                ]);
            }
        },
    });

    const documentGenerationAction = useMutation({
        mutationFn: async (
            action:
                | {
                      kind: 'accept';
                      selected: readonly {
                          candidate: DictionaryGenerationCandidate;
                          rowIndex: number;
                      }[];
                  }
                | { kind: 'cancel' }
                | { kind: 'discard' }
                | {
                      kind: 'retry-failures';
                      rowIndexes: readonly number[];
                  }
                | { file: File; instruction?: string; kind: 'start' },
        ) => {
            const versions = cards.data?.pages[0];
            if (!versions) throw new Error('Dictionary unavailable');
            if (action.kind === 'accept') {
                if (!documentGenerationJobId)
                    throw new Error('Document generation job unavailable');
                return requestWithSession((token) =>
                    dictionaryApi.acceptGenerationJob(
                        token,
                        documentGenerationJobId,
                        {
                            format: 'document-terms:v1',
                            selected: [...action.selected],
                        },
                    ),
                );
            }
            if (action.kind === 'cancel' || action.kind === 'discard') {
                if (!documentGenerationJobId)
                    throw new Error('Document generation job unavailable');
                return requestWithSession((token) =>
                    action.kind === 'cancel'
                        ? dictionaryApi.cancelGenerationJob(
                              token,
                              documentGenerationJobId,
                          )
                        : dictionaryApi.discardGenerationJob(
                              token,
                              documentGenerationJobId,
                          ),
                );
            }
            if (action.kind === 'retry-failures') {
                if (!documentGenerationJobId)
                    throw new Error('Document generation job unavailable');
                const rowIndexes = [...action.rowIndexes].sort(
                    (left, right) => left - right,
                );
                const attempt = retainIdempotencyAttempt(
                    documentRetryAttempt.current,
                    JSON.stringify({
                        dictionaryId,
                        expectedDictionaryVersion: versions.dictionaryVersion,
                        expectedSettingsVersion: versions.settingsVersion,
                        jobId: documentGenerationJobId,
                        rowIndexes,
                    }),
                );
                documentRetryAttempt.current = attempt;
                const response = await requestWithSession((token) =>
                    dictionaryApi.retryDocumentTermsGeneration(
                        token,
                        documentGenerationJobId,
                        {
                            expectedDictionaryVersion:
                                versions.dictionaryVersion,
                            expectedSettingsVersion: versions.settingsVersion,
                            rowIndexes,
                        },
                        attempt.key,
                    ),
                );
                documentRetryAttempt.current = null;
                return response;
            }

            const mediaType = documentMediaTypeForFile(action.file);
            if (!mediaType)
                throw new Error(t('dictionary.document.invalidFile'));
            if (
                action.file.size < 1 ||
                action.file.size >
                    documentIngestionLimitsV1.upload.maximumFileBytes
            ) {
                throw new Error(t('dictionary.document.invalidFileSize'));
            }
            const sha256 = await fileSha256(action.file);
            const instruction = action.instruction?.trim() || null;
            const fingerprint = JSON.stringify({
                dictionaryId,
                expectedDictionaryVersion: versions.dictionaryVersion,
                expectedSettingsVersion: versions.settingsVersion,
                instruction,
                mediaType,
                sha256,
                sizeBytes: action.file.size,
            });
            const attempt = retainIdempotencyAttempt(
                documentUploadAttempt.current,
                fingerprint,
            );
            documentUploadAttempt.current = attempt;
            const authorization = await requestWithSession((token) =>
                dictionaryApi.createDocumentUpload(
                    token,
                    dictionaryId,
                    {
                        expectedDictionaryVersion: versions.dictionaryVersion,
                        expectedSettingsVersion: versions.settingsVersion,
                        instruction,
                        mediaType,
                        sha256,
                        sizeBytes: action.file.size,
                    },
                    attempt.key,
                ),
            );
            setDocumentGenerationJobId(authorization.job.id);
            syncDocumentGenerationUrl(authorization.job.id);
            queryClient.setQueryData(
                ['dictionary-document-generation-job', authorization.job.id],
                { job: authorization.job },
            );
            const uploaded = await dictionaryApi.uploadDocument(
                authorization.upload,
                action.file,
            );
            const response = await requestWithSession((token) =>
                dictionaryApi.completeDocumentUpload(
                    token,
                    authorization.upload.id,
                    uploaded,
                ),
            );
            documentUploadAttempt.current = null;
            return response;
        },
        onSuccess: async (response) => {
            if (response.job.kind === 'pasted-terms') {
                setDocumentGenerationOpen(false);
                setDocumentGenerationJobId(null);
                syncDocumentGenerationUrl(null);
                setBatchGenerationOpen(true);
                setBatchGenerationJobId(response.job.id);
                syncBatchGenerationUrl(response.job.id);
                queryClient.setQueryData(
                    ['dictionary-batch-generation-job', response.job.id],
                    { job: response.job },
                );
                return;
            }
            if (response.job.kind !== 'document-terms') return;
            setDocumentGenerationJobId(response.job.id);
            syncDocumentGenerationUrl(response.job.id);
            queryClient.setQueryData(
                ['dictionary-document-generation-job', response.job.id],
                { job: response.job },
            );
            if (response.job.state === 'accepted') {
                setOutcome(
                    t('dictionary.document.saved', {
                        count: response.job.outcome?.cards.length ?? 0,
                    }),
                );
                await Promise.all([
                    queryClient.invalidateQueries({
                        queryKey: ['dictionary-cards', dictionaryId],
                    }),
                    queryClient.invalidateQueries({
                        queryKey: ['dictionary', dictionaryId],
                    }),
                    queryClient.invalidateQueries({
                        queryKey: ['dictionaries'],
                    }),
                ]);
            }
        },
    });

    const interchangePreviewAction = useMutation({
        mutationFn: (body: PreviewDictionaryImportRequest) =>
            requestWithSession((token) =>
                dictionaryApi.previewImport(token, body),
            ),
        onSuccess: (response) => setInterchangePreview(response),
    });
    const interchangeImportAction = useMutation({
        mutationFn: (body: ImportDictionaryRequest) => {
            const fingerprint = JSON.stringify(body);
            interchangeAttempt.current = retainIdempotencyAttempt(
                interchangeAttempt.current,
                fingerprint,
            );
            return requestWithSession((token) =>
                dictionaryApi.importDictionary(
                    token,
                    body,
                    interchangeAttempt.current!.key,
                ),
            );
        },
        onSuccess: async (response) => {
            interchangeAttempt.current = null;
            setInterchangeOpen(null);
            setInterchangePreview(null);
            if (response.mode === 'ai') {
                setBatchGenerationOpen(true);
                setBatchGenerationJobId(response.job.id);
                syncBatchGenerationUrl(response.job.id);
                queryClient.setQueryData(
                    ['dictionary-batch-generation-job', response.job.id],
                    { job: response.job },
                );
                return;
            }
            setOutcome(
                t('dictionary.interchange.imported', {
                    count: response.cards.length,
                }),
            );
            await Promise.all([
                queryClient.invalidateQueries({
                    queryKey: ['dictionary-cards', dictionaryId],
                }),
                queryClient.invalidateQueries({
                    queryKey: ['dictionary', dictionaryId],
                }),
                queryClient.invalidateQueries({ queryKey: ['dictionaries'] }),
            ]);
        },
    });
    const interchangeExportAction = useMutation({
        mutationFn: async (format: DictionaryExportFormat) => {
            if (format === 'quizlet-text') {
                const result = await requestWithSession((token) =>
                    dictionaryApi.exportDictionary(token, dictionaryId, format),
                );
                await copyDictionaryExport(result.response);
                return 'copied' as const;
            }
            const saved = await saveDictionaryExport({
                contentType: 'text/csv; charset=utf-8',
                description: t('dictionary.interchange.exportTypeDescription'),
                load: () =>
                    requestWithSession((token) =>
                        dictionaryApi.exportDictionary(
                            token,
                            dictionaryId,
                            format,
                        ),
                    ),
                suggestedName: `dictionary-${dictionaryId}.csv`,
            });
            return saved === 'saved' ? ('downloaded' as const) : null;
        },
        onSuccess: (result) => {
            if (result)
                setOutcome(
                    result === 'copied'
                        ? t('dictionary.interchange.copied')
                        : t('dictionary.interchange.downloaded'),
                );
        },
    });

    const loadError =
        dictionary.error ??
        languages.error ??
        (cards.data ? null : cards.error);
    if (loadError) {
        const missing =
            loadError instanceof DictionaryApiError &&
            loadError.detail.code === 'dictionary_not_found';
        return (
            <main className={styles.main}>
                <ErrorState
                    action={
                        missing ? (
                            <ButtonLink href={href('/dictionaries')}>
                                {t('dictionary.backToLibrary')}
                            </ButtonLink>
                        ) : (
                            <Button
                                onClick={() => {
                                    void dictionary.refetch();
                                    void languages.refetch();
                                    void cards.refetch();
                                }}
                                type='button'
                            >
                                {t('common.retry')}
                            </Button>
                        )
                    }
                    title={
                        missing
                            ? t('dictionary.unavailable')
                            : t('dictionary.error.title')
                    }
                >
                    {missing
                        ? t('dictionary.unavailableHelp')
                        : dictionaryErrorMessage(loadError, t)}
                </ErrorState>
            </main>
        );
    }
    if (
        dictionary.isPending ||
        languages.isPending ||
        cards.isPending ||
        !dictionary.data ||
        !languages.data ||
        !cards.data
    ) {
        return (
            <main className={styles.main}>
                <LoadingState>{t('dictionary.editor.loading')}</LoadingState>
            </main>
        );
    }
    const current = dictionary.data.dictionary;
    const catalog = languages.data.languages;
    const currentVersions = cards.data.pages[0]!;
    const cardList = cards.data.pages.flatMap((page) => page.data);
    const mutationError =
        updateSettings.error ??
        lifecycle.error ??
        cardMutation.error ??
        cardLifecycleMutation.error ??
        reorder.error ??
        share.error;
    const conflict =
        mutationError instanceof DictionaryApiError &&
        mutationError.detail.code === 'version_conflict';
    const generationConflict =
        (generationAction.error instanceof DictionaryApiError &&
            generationAction.error.detail.code === 'version_conflict') ||
        isGenerationJobStale(generationJob.data?.job, generationCard.data);
    async function reloadAfterConflict() {
        setEditing(null);
        updateSettings.reset();
        lifecycle.reset();
        cardMutation.reset();
        cardLifecycleMutation.reset();
        reorder.reset();
        share.reset();
        await Promise.all([dictionary.refetch(), cards.refetch()]);
    }

    return (
        <main className={styles.main}>
            <ButtonLink href={href('/dictionaries')} variant='quiet'>
                ← {t('dictionary.backToLibrary')}
            </ButtonLink>
            <header className={styles.header}>
                <div>
                    <div className={styles.titleRow}>
                        <h1>{current.name}</h1>
                        <Badge
                            tone={
                                current.lifecycle === 'archived'
                                    ? 'warning'
                                    : 'info'
                            }
                        >
                            {t(`dictionary.lifecycle.${current.lifecycle}`)}
                        </Badge>
                    </div>
                    <p>
                        {languageLabel(catalog, current.sourceLanguage, locale)}{' '}
                        →{' '}
                        {languageLabel(catalog, current.targetLanguage, locale)}
                    </p>
                </div>
                <Button
                    loading={lifecycle.isPending}
                    onClick={() =>
                        lifecycle.mutate(
                            current.lifecycle === 'active'
                                ? 'archived'
                                : 'active',
                        )
                    }
                    type='button'
                    variant={
                        current.lifecycle === 'active' ? 'danger' : 'secondary'
                    }
                >
                    {current.lifecycle === 'active'
                        ? t('dictionary.library.archive')
                        : t('dictionary.library.restore')}
                </Button>
            </header>
            {conflict ? (
                <ErrorState
                    action={
                        <Button
                            onClick={() => void reloadAfterConflict()}
                            type='button'
                        >
                            {t('dictionary.conflict.reload')}
                        </Button>
                    }
                    title={t('dictionary.conflict.title')}
                >
                    {t('dictionary.conflict.help')}
                </ErrorState>
            ) : mutationError ? (
                <p role='alert'>{dictionaryErrorMessage(mutationError, t)}</p>
            ) : null}
            <p aria-live='polite' className={styles.outcome}>
                {outcome}
            </p>

            {current.lifecycle === 'archived' ? (
                <EmptyState title={t('dictionary.editor.archived')}>
                    {t('dictionary.editor.archivedHelp')}
                </EmptyState>
            ) : (
                <>
                    <DictionarySettingsForm
                        dictionary={current}
                        error={
                            updateSettings.error
                                ? dictionaryErrorMessage(
                                      updateSettings.error,
                                      t,
                                  )
                                : null
                        }
                        languages={catalog}
                        onSave={async (values) =>
                            updateSettings.mutateAsync(values)
                        }
                        pending={updateSettings.isPending}
                    />
                    <DictionarySharing
                        dictionary={current}
                        onRevoke={async () => {
                            await share.mutateAsync('revoke');
                        }}
                        onRotate={async () => {
                            const response = await share.mutateAsync('rotate');
                            if (!response.capability)
                                throw new Error('Capability unavailable');
                            return response.capability;
                        }}
                        pending={share.isPending}
                    />
                    <section className={styles.cardsSection}>
                        <div className={styles.cardsHeader}>
                            <div>
                                <h2>
                                    {t('dictionary.cards.title', {
                                        count: current.activeCardCount,
                                    })}
                                </h2>
                                <p>{t('dictionary.cards.orderHelp')}</p>
                            </div>
                            <div className={styles.cardsActions}>
                                <Button
                                    disabled={cardMutation.isPending}
                                    onClick={() => {
                                        void flushCardAuthoringCleanup();
                                        setAuthoringJobId(null);
                                        setAuthoringReviewJob(null);
                                        authoringAttempt.current = null;
                                        cardAuthoringAction.reset();
                                        setEditing('new');
                                    }}
                                    type='button'
                                >
                                    {t('dictionary.cards.add')}
                                </Button>
                                <Button
                                    disabled={interchangeImportAction.isPending}
                                    onClick={() => {
                                        setInterchangePreview(null);
                                        interchangePreviewAction.reset();
                                        interchangeImportAction.reset();
                                        setInterchangeOpen('import');
                                    }}
                                    type='button'
                                    variant='secondary'
                                >
                                    {t('dictionary.interchange.openImport')}
                                </Button>
                                <Button
                                    disabled={interchangeExportAction.isPending}
                                    onClick={() => {
                                        interchangeExportAction.reset();
                                        setInterchangeOpen('export');
                                    }}
                                    type='button'
                                    variant='secondary'
                                >
                                    {t('dictionary.interchange.openExport')}
                                </Button>
                                <Button
                                    disabled={
                                        batchGenerationAction.isPending ||
                                        generationCapabilities.data
                                            ?.pastedTermsGeneration
                                            .available !== true
                                    }
                                    onClick={() => {
                                        setBatchGenerationJobId(null);
                                        setBatchGenerationOpen(true);
                                        syncBatchGenerationUrl(null);
                                        batchGenerationAction.reset();
                                    }}
                                    type='button'
                                    variant='secondary'
                                >
                                    {t('dictionary.batch.open')}
                                </Button>
                                <Button
                                    disabled={
                                        documentGenerationAction.isPending ||
                                        generationCapabilities.data
                                            ?.documentTermsGeneration
                                            .available !== true
                                    }
                                    onClick={() => {
                                        setDocumentGenerationJobId(null);
                                        setDocumentGenerationOpen(true);
                                        syncDocumentGenerationUrl(null);
                                        documentGenerationAction.reset();
                                    }}
                                    type='button'
                                    variant='secondary'
                                >
                                    {t('dictionary.document.open')}
                                </Button>
                            </div>
                        </div>
                        <div className={styles.filters}>
                            <Field label={t('dictionary.cards.search')}>
                                <Input
                                    onChange={(event) =>
                                        setSearch(event.currentTarget.value)
                                    }
                                    type='search'
                                    value={search}
                                />
                            </Field>
                            <Field label={t('dictionary.cards.lifecycle')}>
                                <Select
                                    onChange={(event) =>
                                        setCardLifecycle(
                                            event.currentTarget
                                                .value as DictionaryLifecycle,
                                        )
                                    }
                                    value={cardLifecycle}
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
                        <BottomSheet
                            closeLabel={t('common.cancel')}
                            description={t('dictionary.batch.sheetHelp')}
                            dismissible={!batchGenerationAction.isPending}
                            onClose={() => {
                                setBatchGenerationOpen(false);
                                setBatchGenerationJobId(null);
                                syncBatchGenerationUrl(null);
                            }}
                            open={batchGenerationOpen}
                            size='large'
                            title={t('dictionary.batch.title')}
                        >
                            {batchGenerationOpen &&
                            batchGenerationJobId &&
                            batchGenerationJob.isPending ? (
                                <LoadingState>
                                    {t('dictionary.batch.loading')}
                                </LoadingState>
                            ) : batchGenerationOpen &&
                              batchGenerationJobId &&
                              batchGenerationJob.isError &&
                              !batchGenerationJob.data ? (
                                <ErrorState
                                    action={
                                        <Button
                                            onClick={() =>
                                                void batchGenerationJob.refetch()
                                            }
                                            type='button'
                                        >
                                            {t('common.retry')}
                                        </Button>
                                    }
                                    title={t('dictionary.batch.loadFailed')}
                                >
                                    {dictionaryErrorMessage(
                                        batchGenerationJob.error,
                                        t,
                                    )}
                                </ErrorState>
                            ) : batchGenerationOpen ? (
                                <DictionaryBatchGenerationPanel
                                    available={
                                        generationCapabilities.data
                                            ?.pastedTermsGeneration
                                            .available === true
                                    }
                                    conflict={
                                        (batchGenerationAction.error instanceof
                                            DictionaryApiError &&
                                            batchGenerationAction.error.detail
                                                .code === 'version_conflict') ||
                                        (batchGenerationJob.data?.job != null &&
                                            batchGenerationJob.data.job
                                                .state === 'review' &&
                                            (batchGenerationJob.data.job
                                                .expectedDictionaryVersion !==
                                                cards.data?.pages[0]
                                                    ?.dictionaryVersion ||
                                                batchGenerationJob.data.job
                                                    .expectedSettingsVersion !==
                                                    cards.data?.pages[0]
                                                        ?.settingsVersion ||
                                                batchGenerationJob.data.job
                                                    .sourceLanguage !==
                                                    current.sourceLanguage ||
                                                batchGenerationJob.data.job
                                                    .targetLanguage !==
                                                    current.targetLanguage))
                                    }
                                    dictionary={current}
                                    error={
                                        batchGenerationAction.error
                                            ? dictionaryErrorMessage(
                                                  batchGenerationAction.error,
                                                  t,
                                              )
                                            : batchGenerationJob.error
                                              ? dictionaryErrorMessage(
                                                    batchGenerationJob.error,
                                                    t,
                                                )
                                              : null
                                    }
                                    {...(batchGenerationJob.data?.job
                                        ? {
                                              job: batchGenerationJob.data.job,
                                          }
                                        : {})}
                                    languages={catalog}
                                    onAccept={async (selected) => {
                                        await batchGenerationAction.mutateAsync(
                                            {
                                                kind: 'accept',
                                                selected,
                                            },
                                        );
                                    }}
                                    onCancel={async () => {
                                        await batchGenerationAction.mutateAsync(
                                            {
                                                kind: 'cancel',
                                            },
                                        );
                                    }}
                                    onClose={() => {
                                        setBatchGenerationOpen(false);
                                        setBatchGenerationJobId(null);
                                        syncBatchGenerationUrl(null);
                                    }}
                                    onDiscard={async () => {
                                        await batchGenerationAction.mutateAsync(
                                            {
                                                kind: 'discard',
                                            },
                                        );
                                    }}
                                    onReloadConflict={async () => {
                                        batchGenerationAction.reset();
                                        await Promise.all([
                                            dictionary.refetch(),
                                            cards.refetch(),
                                            batchGenerationJob.refetch(),
                                        ]);
                                    }}
                                    onRetryFailures={async (failures) => {
                                        await batchGenerationAction.mutateAsync(
                                            {
                                                kind: 'retry-failures',
                                                rowIndexes: failures.map(
                                                    (failure) =>
                                                        failure.rowIndex,
                                                ),
                                            },
                                        );
                                    }}
                                    onStart={async (input) => {
                                        await batchGenerationAction.mutateAsync(
                                            {
                                                ...input,
                                                kind: 'start',
                                            },
                                        );
                                    }}
                                    pendingAction={
                                        batchGenerationAction.isPending
                                    }
                                />
                            ) : null}
                        </BottomSheet>
                        <BottomSheet
                            closeLabel={t('common.cancel')}
                            dismissible={
                                !interchangePreviewAction.isPending &&
                                !interchangeImportAction.isPending
                            }
                            onClose={() => {
                                setInterchangeOpen(null);
                                setInterchangePreview(null);
                            }}
                            open={interchangeOpen === 'import'}
                            size='large'
                            title={t('dictionary.interchange.importTitle')}
                        >
                            {interchangeOpen === 'import' ? (
                                <DictionaryImportPanel
                                    aiAvailable={
                                        generationCapabilities.data
                                            ?.importPairsGeneration
                                            .available === true
                                    }
                                    error={
                                        interchangePreviewAction.error
                                            ? dictionaryErrorMessage(
                                                  interchangePreviewAction.error,
                                                  t,
                                              )
                                            : interchangeImportAction.error
                                              ? dictionaryErrorMessage(
                                                    interchangeImportAction.error,
                                                    t,
                                                )
                                              : null
                                    }
                                    onCommit={async (request) => {
                                        await interchangeImportAction.mutateAsync(
                                            request,
                                        );
                                    }}
                                    onPreview={async (request) => {
                                        await interchangePreviewAction.mutateAsync(
                                            request,
                                        );
                                    }}
                                    optionalFieldsEnabled={
                                        current.settings.values
                                            .transcriptionEnabled ||
                                        current.settings.values
                                            .definitionEnabled ||
                                        current.settings.values.exampleEnabled
                                    }
                                    languages={catalog}
                                    pending={
                                        interchangePreviewAction.isPending ||
                                        interchangeImportAction.isPending
                                    }
                                    preview={interchangePreview}
                                    sourceLanguage={current.sourceLanguage}
                                    target={{
                                        dictionaryId,
                                        expectedDictionaryVersion:
                                            currentVersions.dictionaryVersion,
                                        expectedSettingsVersion:
                                            currentVersions.settingsVersion,
                                        kind: 'existing',
                                    }}
                                    targetLanguage={current.targetLanguage}
                                />
                            ) : null}
                        </BottomSheet>
                        <BottomSheet
                            closeLabel={t('common.cancel')}
                            dismissible={!interchangeExportAction.isPending}
                            onClose={() => setInterchangeOpen(null)}
                            open={interchangeOpen === 'export'}
                            title={t('dictionary.interchange.exportTitle')}
                        >
                            {interchangeOpen === 'export' ? (
                                <DictionaryExportPanel
                                    error={
                                        interchangeExportAction.error
                                            ? interchangeExportAction.error instanceof
                                              DictionaryExportSaveError
                                                ? t(
                                                      'dictionary.interchange.exportStreamingRequired',
                                                  )
                                                : dictionaryErrorMessage(
                                                      interchangeExportAction.error,
                                                      t,
                                                  )
                                            : null
                                    }
                                    onExport={async (format) => {
                                        await interchangeExportAction.mutateAsync(
                                            format,
                                        );
                                    }}
                                    pending={interchangeExportAction.isPending}
                                />
                            ) : null}
                        </BottomSheet>
                        <BottomSheet
                            closeLabel={t('common.cancel')}
                            description={t('dictionary.document.sheetHelp')}
                            dismissible={!documentGenerationAction.isPending}
                            onClose={() => {
                                setDocumentGenerationOpen(false);
                                setDocumentGenerationJobId(null);
                                syncDocumentGenerationUrl(null);
                            }}
                            open={documentGenerationOpen}
                            size='large'
                            title={t('dictionary.document.title')}
                        >
                            {documentGenerationOpen &&
                            documentGenerationJobId &&
                            documentGenerationJob.isPending ? (
                                <LoadingState>
                                    {t('dictionary.document.loading')}
                                </LoadingState>
                            ) : documentGenerationOpen &&
                              documentGenerationJobId &&
                              documentGenerationJob.isError &&
                              !documentGenerationJob.data ? (
                                <ErrorState
                                    action={
                                        <Button
                                            onClick={() =>
                                                void documentGenerationJob.refetch()
                                            }
                                            type='button'
                                        >
                                            {t('common.retry')}
                                        </Button>
                                    }
                                    title={t('dictionary.document.loadFailed')}
                                >
                                    {dictionaryErrorMessage(
                                        documentGenerationJob.error,
                                        t,
                                    )}
                                </ErrorState>
                            ) : documentGenerationOpen ? (
                                <DictionaryDocumentGenerationPanel
                                    available={
                                        generationCapabilities.data
                                            ?.documentTermsGeneration
                                            .available === true
                                    }
                                    conflict={
                                        (documentGenerationAction.error instanceof
                                            DictionaryApiError &&
                                            documentGenerationAction.error
                                                .detail.code ===
                                                'version_conflict') ||
                                        (documentGenerationJob.data?.job
                                            ?.state === 'review' &&
                                            (documentGenerationJob.data.job
                                                .expectedDictionaryVersion !==
                                                cards.data?.pages[0]
                                                    ?.dictionaryVersion ||
                                                documentGenerationJob.data.job
                                                    .expectedSettingsVersion !==
                                                    cards.data?.pages[0]
                                                        ?.settingsVersion ||
                                                documentGenerationJob.data.job
                                                    .sourceLanguage !==
                                                    current.sourceLanguage ||
                                                documentGenerationJob.data.job
                                                    .targetLanguage !==
                                                    current.targetLanguage))
                                    }
                                    dictionary={current}
                                    error={
                                        documentGenerationAction.error
                                            ? dictionaryErrorMessage(
                                                  documentGenerationAction.error,
                                                  t,
                                              )
                                            : documentGenerationJob.error
                                              ? dictionaryErrorMessage(
                                                    documentGenerationJob.error,
                                                    t,
                                                )
                                              : null
                                    }
                                    {...(documentGenerationJob.data?.job
                                        ? {
                                              job: documentGenerationJob.data
                                                  .job,
                                          }
                                        : {})}
                                    languages={catalog}
                                    nativeExtractionAvailable={
                                        generationCapabilities.data
                                            ?.documentTermsGeneration
                                            .available === true
                                    }
                                    ocrAvailable={
                                        generationCapabilities.data?.documentOcr
                                            .available === true
                                    }
                                    onAccept={async (selected) => {
                                        await documentGenerationAction.mutateAsync(
                                            { kind: 'accept', selected },
                                        );
                                    }}
                                    onCancel={async () => {
                                        await documentGenerationAction.mutateAsync(
                                            { kind: 'cancel' },
                                        );
                                    }}
                                    onClose={() => {
                                        setDocumentGenerationOpen(false);
                                        setDocumentGenerationJobId(null);
                                        syncDocumentGenerationUrl(null);
                                    }}
                                    onDiscard={async () => {
                                        await documentGenerationAction.mutateAsync(
                                            { kind: 'discard' },
                                        );
                                    }}
                                    onReloadConflict={async () => {
                                        documentGenerationAction.reset();
                                        await Promise.all([
                                            dictionary.refetch(),
                                            cards.refetch(),
                                            documentGenerationJob.refetch(),
                                        ]);
                                    }}
                                    onRetryFailures={async (failures) => {
                                        await documentGenerationAction.mutateAsync(
                                            {
                                                kind: 'retry-failures',
                                                rowIndexes: failures.map(
                                                    (failure) =>
                                                        failure.rowIndex,
                                                ),
                                            },
                                        );
                                    }}
                                    onStart={async (input) => {
                                        await documentGenerationAction.mutateAsync(
                                            { ...input, kind: 'start' },
                                        );
                                    }}
                                    pendingAction={
                                        documentGenerationAction.isPending
                                    }
                                />
                            ) : null}
                        </BottomSheet>
                        <BottomSheet
                            closeLabel={t('common.cancel')}
                            dismissible={
                                !cardMutation.isPending &&
                                !cardAuthoringAction.isPending
                            }
                            onClose={() => {
                                setEditing(null);
                                setAuthoringJobId(null);
                                setAuthoringReviewJob(null);
                                authoringAttempt.current = null;
                            }}
                            open={editing !== null}
                            size='large'
                            title={
                                editing && editing !== 'new'
                                    ? t('dictionary.card.editTitle')
                                    : t('dictionary.card.createTitle')
                            }
                        >
                            {editing ? (
                                <DictionaryCardForm
                                    ai={
                                        editing === 'new'
                                            ? {
                                                  available:
                                                      generationCapabilities
                                                          .data
                                                          ?.cardAuthoringGeneration
                                                          .available === true,
                                                  error:
                                                      cardAuthoringAction.error ||
                                                      authoringJob.isError ||
                                                      authoringJob.data
                                                          ?.state === 'failed'
                                                          ? t(
                                                                'dictionary.authoring.failed',
                                                            )
                                                          : null,
                                                  job:
                                                      authoringJob.data ?? null,
                                                  onAction: async (action) => {
                                                      await cardAuthoringAction.mutateAsync(
                                                          action,
                                                      );
                                                  },
                                                  pending:
                                                      cardAuthoringAction.isPending,
                                                  proposal:
                                                      authoringReviewJob?.proposal ??
                                                      null,
                                                  successorActive: Boolean(
                                                      authoringReviewJob &&
                                                      (authoringJob.data
                                                          ?.state ===
                                                          'queued' ||
                                                          authoringJob.data
                                                              ?.state ===
                                                              'running'),
                                                  ),
                                              }
                                            : undefined
                                    }
                                    card={
                                        editing === 'new' ? undefined : editing
                                    }
                                    dictionary={current}
                                    embedded
                                    existingSources={cardList
                                        .filter(
                                            (candidate) =>
                                                editing === 'new' ||
                                                candidate.id !== editing.id,
                                        )
                                        .map(
                                            (candidate) =>
                                                candidate.values.source,
                                        )}
                                    error={
                                        cardMutation.error
                                            ? dictionaryErrorMessage(
                                                  cardMutation.error,
                                                  t,
                                              )
                                            : null
                                    }
                                    languages={catalog}
                                    onCancel={() => {
                                        setEditing(null);
                                        setAuthoringJobId(null);
                                        setAuthoringReviewJob(null);
                                        authoringAttempt.current = null;
                                    }}
                                    onReloadConflict={
                                        cardMutation.error instanceof
                                            DictionaryApiError &&
                                        cardMutation.error.detail.code ===
                                            'version_conflict'
                                            ? reloadAfterConflict
                                            : undefined
                                    }
                                    onSave={async (
                                        draft,
                                        selectedSuggestions,
                                    ) => {
                                        if (
                                            editing === 'new' &&
                                            authoringReviewJob
                                        ) {
                                            if (
                                                authoringReviewJob &&
                                                (authoringJob.data?.state ===
                                                    'queued' ||
                                                    authoringJob.data?.state ===
                                                        'running')
                                            )
                                                throw new Error(
                                                    'Card authoring successor is active',
                                                );
                                            await cardAuthoringAction.mutateAsync(
                                                {
                                                    draft,
                                                    kind: 'accept',
                                                    selectedSuggestions,
                                                },
                                            );
                                            return;
                                        }
                                        await cardMutation.mutateAsync({
                                            ...(editing === 'new'
                                                ? {}
                                                : { card: editing }),
                                            draft,
                                        });
                                    }}
                                    pending={
                                        cardMutation.isPending ||
                                        (cardAuthoringAction.isPending &&
                                            cardAuthoringAction.variables
                                                ?.kind === 'accept')
                                    }
                                    showHeading={false}
                                />
                            ) : null}
                        </BottomSheet>
                        {generationTarget && generationJob.isPending ? (
                            <LoadingState>
                                {t('dictionary.generation.loading')}
                            </LoadingState>
                        ) : generationTarget &&
                          generationJob.isError &&
                          !generationJob.data ? (
                            <ErrorState
                                action={
                                    <Button
                                        onClick={() =>
                                            void generationJob.refetch()
                                        }
                                        type='button'
                                    >
                                        {t('common.retry')}
                                    </Button>
                                }
                                title={t('dictionary.generation.loadFailed')}
                            >
                                {dictionaryErrorMessage(generationJob.error, t)}
                            </ErrorState>
                        ) : generationTarget ? (
                            <DictionaryGenerationPanel
                                available={
                                    generationCapabilities.data
                                        ?.singleCardGeneration.available ===
                                    true
                                }
                                card={generationCard.data?.card}
                                conflict={generationConflict}
                                currentCard={
                                    generationCompared
                                        ? generationCard.data?.card
                                        : undefined
                                }
                                dictionary={current}
                                error={
                                    generationJob.error ||
                                    generationAction.error
                                        ? dictionaryErrorMessage(
                                              generationJob.error ??
                                                  generationAction.error,
                                              t,
                                          )
                                        : null
                                }
                                job={generationJob.data?.job ?? undefined}
                                languages={catalog}
                                onAccept={async (candidate) => {
                                    await generationAction.mutateAsync({
                                        candidate,
                                        kind: 'accept',
                                    });
                                }}
                                onCancel={async () => {
                                    await generationAction.mutateAsync({
                                        kind: 'cancel',
                                    });
                                }}
                                onClose={() => {
                                    setGenerationTarget(null);
                                    setGenerationCompared(false);
                                    syncGenerationUrl(null);
                                    generationAction.reset();
                                }}
                                onDiscard={async () => {
                                    await generationAction.mutateAsync({
                                        kind: 'discard',
                                    });
                                }}
                                onRegenerate={async (instruction) => {
                                    await generationAction.mutateAsync({
                                        kind: 'regenerate',
                                        ...(instruction ? { instruction } : {}),
                                    });
                                }}
                                onReloadCompare={async () => {
                                    await Promise.all([
                                        dictionary.refetch(),
                                        cards.refetch(),
                                        generationCard.refetch(),
                                    ]);
                                    setGenerationCompared(true);
                                }}
                                onStart={async (instruction) => {
                                    await generationAction.mutateAsync({
                                        kind: 'start',
                                        ...(instruction ? { instruction } : {}),
                                    });
                                }}
                                pendingAction={generationAction.isPending}
                            />
                        ) : null}
                        {generationCapabilities.isSuccess &&
                        !generationCapabilities.data.singleCardGeneration
                            .available ? (
                            <InlineAlert tone='info'>
                                {t('dictionary.generation.error.unavailable')}
                            </InlineAlert>
                        ) : null}
                        {generationCapabilities.isError ? (
                            <InlineAlert tone='warning'>
                                {t('dictionary.generation.capabilityFailed')}{' '}
                                <Button
                                    onClick={() =>
                                        void generationCapabilities.refetch()
                                    }
                                    size='small'
                                    type='button'
                                    variant='quiet'
                                >
                                    {t('common.retry')}
                                </Button>
                            </InlineAlert>
                        ) : null}
                        <DictionaryCardList
                            cards={cardList}
                            dictionary={current}
                            languages={catalog}
                            lifecycle={cardLifecycle}
                            generationAvailable={
                                generationCapabilities.data
                                    ?.singleCardGeneration.available === true
                            }
                            reorderEnabled={
                                cardLifecycle === 'active' &&
                                search.trim() === ''
                            }
                            onEdit={setEditing}
                            onGenerate={(card) => {
                                const nextTarget = { cardId: card.id };
                                setEditing(null);
                                setGenerationTarget(nextTarget);
                                setGenerationCompared(false);
                                syncGenerationUrl(nextTarget);
                                generationAction.reset();
                            }}
                            onLifecycle={(card) =>
                                cardLifecycleMutation.mutate(card)
                            }
                            onMove={(card, direction) =>
                                reorder.mutate({ card, direction })
                            }
                            pending={
                                cardMutation.isPending ||
                                cardLifecycleMutation.isPending ||
                                reorder.isPending
                            }
                        />
                        {cards.hasNextPage ? (
                            <Button
                                loading={cards.isFetchingNextPage}
                                onClick={() => void cards.fetchNextPage()}
                                type='button'
                                variant='secondary'
                            >
                                {t('dictionary.cards.loadMore')}
                            </Button>
                        ) : null}
                        {cards.isFetchNextPageError ? (
                            <div role='alert'>
                                <p>{t('dictionary.cards.loadMoreFailed')}</p>
                                {cards.error instanceof DictionaryApiError &&
                                cards.error.detail.code ===
                                    'version_conflict' ? (
                                    <Button
                                        onClick={() =>
                                            void queryClient.resetQueries({
                                                exact: true,
                                                queryKey: cardsQueryKey,
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
                    </section>
                </>
            )}
        </main>
    );
}

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function syncGenerationUrl(
    target: { cardId: string; jobId?: string | undefined } | null,
) {
    const url = new URL(window.location.href);
    if (target) {
        url.searchParams.set('generationCard', target.cardId);
        if (target.jobId) url.searchParams.set('generationJob', target.jobId);
        else url.searchParams.delete('generationJob');
    } else {
        url.searchParams.delete('generationCard');
        url.searchParams.delete('generationJob');
    }
    window.history.replaceState(window.history.state, '', url);
}

function syncBatchGenerationUrl(jobId: string | null) {
    const url = new URL(window.location.href);
    if (jobId) url.searchParams.set('batchGenerationJob', jobId);
    else url.searchParams.delete('batchGenerationJob');
    window.history.replaceState(window.history.state, '', url);
}

function syncDocumentGenerationUrl(jobId: string | null) {
    const url = new URL(window.location.href);
    if (jobId) url.searchParams.set('documentGenerationJob', jobId);
    else url.searchParams.delete('documentGenerationJob');
    window.history.replaceState(window.history.state, '', url);
}
