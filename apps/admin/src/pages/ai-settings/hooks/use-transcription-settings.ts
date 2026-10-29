import { useEffect, useRef, useState } from 'react';
import type {
    KnowledgeTranscriptionAdminState,
    KnowledgeTranscriptionAdminPreview,
    KnowledgeTranscriptionAdminPreviewRequest,
} from '@languon/contracts';
import { transcriptionAdminApi } from '@/shared/api/transcription-admin-api';

export function useTranscriptionSettings() {
    const [state, setState] = useState<KnowledgeTranscriptionAdminState | null>(
        null,
    );
    const [preview, setPreview] =
        useState<KnowledgeTranscriptionAdminPreview | null>(null);
    const [loading, setLoading] = useState(true);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState(false);
    const [published, setPublished] = useState(false);
    const [generation, setGeneration] = useState(0);
    const lock = useRef(false);
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError(false);
        setPreview(null);
        transcriptionAdminApi
            .read(controller.signal)
            .then((value) => {
                if (!controller.signal.aborted) setState(value);
            })
            .catch(() => {
                if (!controller.signal.aborted) setError(true);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [generation]);
    function refresh() {
        if (!lock.current) setGeneration((value) => value + 1);
    }
    function clearPreview() {
        setPreview(null);
        setPublished(false);
    }
    async function review(input: KnowledgeTranscriptionAdminPreviewRequest) {
        if (lock.current) return;
        lock.current = true;
        setPending(true);
        setError(false);
        setPublished(false);
        try {
            setPreview(await transcriptionAdminApi.preview(input));
        } catch {
            setPreview(null);
            setError(true);
        } finally {
            lock.current = false;
            setPending(false);
        }
    }
    async function apply() {
        if (lock.current || !preview) return;
        lock.current = true;
        setPending(true);
        setError(false);
        try {
            setState(
                await transcriptionAdminApi.apply({
                    request: preview.request,
                    proof: preview.proof,
                }),
            );
            setPreview(null);
            setPublished(true);
        } catch {
            setPreview(null);
            setError(true);
        } finally {
            lock.current = false;
            setPending(false);
        }
    }
    return {
        state,
        preview,
        loading,
        pending,
        error,
        published,
        refresh,
        clearPreview,
        review,
        apply,
    };
}
