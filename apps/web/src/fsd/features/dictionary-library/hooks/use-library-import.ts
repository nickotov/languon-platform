import type {
    ImportDictionaryRequest,
    PreviewDictionaryImportRequest,
    PreviewDictionaryImportResponse,
} from '@languon/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, useRef, useState } from 'react';
import {
    dictionaryApi,
    type RequestWithSession,
} from '@/fsd/entities/dictionary';
import { useI18n } from '@/fsd/shared/i18n';
import { retainIdempotencyAttempt } from '../lib/idempotency-attempt';

export function useLibraryImport(requestWithSession: RequestWithSession) {
    const { href } = useI18n();
    const router = useRouter();
    const queryClient = useQueryClient();
    const [importOpen, setImportOpen] = useState(false);
    const [importName, setImportName] = useState('');
    const [importPreview, setImportPreview] =
        useState<PreviewDictionaryImportResponse | null>(null);
    const importAttempt = useRef<{ fingerprint: string; key: string } | null>(
        null,
    );
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

    function openImport() {
        setImportOpen(true);
        setImportPreview(null);
    }
    function closeImport() {
        setImportOpen(false);
        setImportPreview(null);
    }
    function changeName(event: ChangeEvent<HTMLInputElement>) {
        setImportName(event.currentTarget.value);
    }
    async function commit(request: ImportDictionaryRequest) {
        await importMutation.mutateAsync(request);
    }
    async function preview(request: PreviewDictionaryImportRequest) {
        await importPreviewMutation.mutateAsync(request);
    }

    return {
        importOpen,
        importName,
        importPreview,
        importPreviewMutation,
        importMutation,
        openImport,
        closeImport,
        changeName,
        commit,
        preview,
    };
}
export type LibraryImportState = ReturnType<typeof useLibraryImport>;
