import type { RequestWithSession } from '@/fsd/entities/dictionary';
import { type CardAuthoringIdempotencyAttempt } from '@/fsd/features/dictionary-card-authoring';
import { type IdempotencyAttempt } from '@/fsd/features/dictionary-library';
import { useI18n } from '@/fsd/shared/i18n';
import type {
    DictionaryCard,
    DictionaryCardAuthoringGenerationJob,
    DictionaryLifecycle,
    PreviewDictionaryImportResponse,
} from '@languon/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { UUID_PATTERN } from '../lib/generation-url';

export function useEditorState(
    dictionaryId: string,
    requestWithSession: RequestWithSession,
) {
    const { href, locale, t } = useI18n();

    const queryClient = useQueryClient();

    const [search, setSearch] = useState('');

    const [settingsOpen, setSettingsOpen] = useState(false);

    const [cardDraftDirty, setCardDraftDirty] = useState(false);

    const [confirmCardDiscard, setConfirmCardDiscard] = useState(false);

    const [sharingOpen, setSharingOpen] = useState(false);

    useEffect(() => {
        if (
            new URLSearchParams(window.location.search).get('settings') ===
            'open'
        )
            setSettingsOpen(true);
    }, [dictionaryId]);

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

    const cardsQueryKey = [
        'dictionary-cards',
        dictionaryId,
        cardLifecycle,
        search,
    ] as const;

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

    return {
        href,
        locale,
        t,
        queryClient,
        search,
        setSearch,
        settingsOpen,
        setSettingsOpen,
        cardDraftDirty,
        setCardDraftDirty,
        confirmCardDiscard,
        setConfirmCardDiscard,
        sharingOpen,
        setSharingOpen,
        cardLifecycle,
        setCardLifecycle,
        editing,
        setEditing,
        authoringJobId,
        setAuthoringJobId,
        authoringReviewJob,
        setAuthoringReviewJob,
        generationTarget,
        setGenerationTarget,
        generationCompared,
        setGenerationCompared,
        batchGenerationOpen,
        setBatchGenerationOpen,
        batchGenerationJobId,
        setBatchGenerationJobId,
        documentGenerationOpen,
        setDocumentGenerationOpen,
        documentGenerationJobId,
        setDocumentGenerationJobId,
        interchangeOpen,
        setInterchangeOpen,
        interchangePreview,
        setInterchangePreview,
        outcome,
        setOutcome,
        batchEnqueueAttempt,
        documentRetryAttempt,
        documentUploadAttempt,
        interchangeAttempt,
        authoringAttempt,
        cardsQueryKey,
        dictionaryId,
        requestWithSession,
    };
}
