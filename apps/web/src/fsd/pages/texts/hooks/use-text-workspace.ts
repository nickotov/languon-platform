import { type MoveTextRequest, type TextDocument } from '@languon/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { textsApi, type RequestWithTextSession } from '@/fsd/entities/texts';
import {
    emptyWorkspaceInput,
    workspaceInput,
    workspacePairs,
    workspaceValid,
    type WorkspacePair,
} from '../lib/workspace-content';
import {
    useTextWorkspaceExpiry,
    useTextWorkspaceUnload,
} from './use-text-workspace-expiry';
import { useTextWorkspaceSave } from './use-text-workspace-save';
import { useTextWorkspaceData } from './use-text-workspace-data';
import { useTextWorkspaceSession } from './use-text-workspace-session';
import { useTextWorkspaceJob } from './use-text-workspace-job';
import { useTextWorkspaceAuto } from './use-text-workspace-auto';

export function useTextWorkspace(
    folderId: string | null,
    textId: string | undefined,
    sessionRequest: RequestWithTextSession,
    actorId: string,
    sharedFolderConfirmation?: MoveTextRequest['sharedFolderConfirmation'],
) {
    const { request, isCurrent } = useTextWorkspaceSession(
        actorId,
        sessionRequest,
    );

    const client = useQueryClient();
    const [document, setDocument] = useState<TextDocument | null>(null);
    const [input, setInput] = useState(emptyWorkspaceInput);
    const [baseline, setBaseline] = useState(emptyWorkspaceInput);
    const [mode, setMode] = useState<'compose' | 'read' | 'edit'>('compose');
    const [pairs, setPairs] = useState<WorkspacePair[]>([]);
    const [touched, setTouched] = useState<Set<string>>(new Set());
    const [conflict, setConflict] = useState<TextDocument | null>(null);
    const [showErrors, setShowErrors] = useState(false);
    const [expired, setExpired] = useState(false);
    const translation = useTextWorkspaceJob(request, actorId, sessionRequest);
    const detection = useTextWorkspaceJob(request, actorId, sessionRequest);
    const membership = document ? document.folderId : folderId;
    const auto = useTextWorkspaceAuto({
        input,
        folderId: membership,
        document,
        detection,
        translation,
        isCurrent,
        setInput,
    });
    const [suggestionDismissed, setSuggestionDismissed] = useState(false);

    const { folder, remote, languages, pendingJob } = useTextWorkspaceData(
        folderId,
        textId,
        request,
        actorId,
    );

    function adopt(next: TextDocument) {
        if (!isCurrent()) return;
        setDocument(next);
        setInput(workspaceInput(next));
        setBaseline(workspaceInput(next));
        setMode(next.alignment ? 'read' : 'compose');
        setTouched(new Set());
        setConflict(null);
        setShowErrors(false);
        client.setQueryData(['text', actorId, next.id], { text: next });
        void client.invalidateQueries({ queryKey: ['texts'] });
        void client.invalidateQueries({
            queryKey: ['library-navigation', actorId],
        });
    }

    useEffect(() => {
        if (remote.data && !document) adopt(remote.data.text);
    }, [remote.data, document]);

    const recovered = useRef(new Set<string>());
    useEffect(() => {
        const pending = pendingJob.data?.job;
        if (!document || !pending || recovered.current.has(pending.id)) return;
        if (translation.restore(pending)) recovered.current.add(pending.id);
    }, [document, pendingJob.data, translation.job?.state]);

    const result = translation.job?.result;
    const proposal = result && 'alignment' in result ? result : null;
    const previewExpired = useTextWorkspaceExpiry(translation.job, expired);
    const detectionResult =
        !suggestionDismissed &&
        detection.job?.result &&
        'confidence' in detection.job.result
            ? detection.job.result
            : null;
    const unsaved = Boolean(
        proposal ||
        translation.active ||
        touched.size ||
        JSON.stringify(input) !== JSON.stringify(baseline),
    );

    useTextWorkspaceUnload(unsaved);

    async function translate() {
        if (!workspaceValid(input)) {
            setShowErrors(true);
            return;
        }
        setShowErrors(false);
        clearSaveError();
        setExpired(false);
        await auto.start();
    }

    async function detect() {
        setSuggestionDismissed(false);
        await detection.start(
            {
                folderId: membership,
                sourceText: input.sourceText,
                operationId: crypto.randomUUID(),
            },
            true,
        );
    }

    const { saving, saveError, save, clearSaveError } = useTextWorkspaceSave({
        request,
        folderId: membership,
        sharedFolderConfirmation,
        document,
        input,
        mode,
        pairs,
        proposal,
        previewExpired,
        conflict,
        setShowErrors,
        setExpired,
        setConflict,
        setDocument,
        adopt,
        clearProposal: translation.clear,
        isCurrent,
    });

    function startEdit() {
        if (!document) return;
        setPairs(workspacePairs(document));
        setTouched(new Set());
        setShowErrors(false);
        setMode('edit');
    }

    function shortenSource() {
        translation.clear();
        if (document?.alignment) startEdit();
        window.requestAnimationFrame(() =>
            globalThis.document
                .querySelector<HTMLTextAreaElement>('[data-workspace-source]')
                ?.focus(),
        );
    }

    function editPair(
        pairId: string,
        side: 'source' | 'translation',
        value: string,
    ) {
        setPairs((previous) =>
            previous.map((pair) =>
                pair.pairId === pairId ? { ...pair, [side]: value } : pair,
            ),
        );
        setTouched((previous) => new Set(previous).add(pairId));
    }

    function cancelEdit() {
        setMode('read');
        setTouched(new Set());
        setConflict(null);
    }

    async function discardProposal() {
        if (translation.job?.state === 'completed') await translation.cancel();
        translation.clear();
        setExpired(false);
        await pendingJob.refetch();
    }

    async function cancelAi() {
        if (translation.job) recovered.current.delete(translation.job.id);
        await auto.cancel();
        if (textId) await pendingJob.refetch();
    }

    function updateMetadata(next: TextDocument) {
        setDocument(next);
        client.setQueryData(['text', actorId, next.id], { text: next });
        setInput((previous) => ({ ...previous, title: next.title }));
        setBaseline((previous) => ({ ...previous, title: next.title }));
    }

    async function refreshMetadata() {
        if (!document) return;
        try {
            updateMetadata(
                (await request((token) => textsApi.getText(token, document.id)))
                    .text,
            );
        } catch {
            /* Preserve the current editor; a later Save still checks its version. */
        }
    }

    function useNewer() {
        if (conflict) {
            adopt(conflict);
            translation.clear();
        }
    }

    return {
        requestWithSession: request,
        requiresFolderConsent:
            !document &&
            Boolean(folder.data?.isShared) &&
            !(
                sharedFolderConfirmation?.shareId === folder.data?.shareId &&
                sharedFolderConfirmation?.shareVersion ===
                    folder.data?.shareVersion
            ),
        folder,
        remote,
        pendingJob,
        languages,
        document,
        input,
        setInput: auto.changeInput,
        mode,
        pairs,
        touched,
        saving,
        saveError,
        conflict,
        showErrors,
        translation,
        autoDetecting: auto.detecting,
        autoError: auto.error,
        aiActive: auto.detecting || translation.active || detection.active,
        cancelAi,
        detection,
        detectionResult,
        suggestionDismissed,
        setSuggestionDismissed,
        proposal,
        previewExpired,
        unsaved,
        translate,
        detect,
        save,
        startEdit,
        shortenSource,
        editPair,
        cancelEdit,
        discardProposal,
        useNewer,
        adopt,
        updateMetadata,
        refreshMetadata,
    };
}
export type TextWorkspace = ReturnType<typeof useTextWorkspace>;
