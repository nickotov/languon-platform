import {
    TextLanguageSchema,
    type TextDocument,
    type TextTranslationProposal,
} from '@languon/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
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

export function useTextWorkspace(
    folderId: string,
    textId: string | undefined,
    sessionRequest: RequestWithTextSession,
    actorId: string,
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
    const translation = useTextWorkspaceJob(request, actorId);
    const detection = useTextWorkspaceJob(request, actorId);
    const [suggestionDismissed, setSuggestionDismissed] = useState(false);
    const { folder, remote, languages } = useTextWorkspaceData(
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
        client.setQueryData(['text', actorId, next.id], { text: next });
        void client.invalidateQueries({ queryKey: ['texts'] });
    }
    useEffect(() => {
        if (remote.data && !document) adopt(remote.data.text);
    }, [remote.data, document]);
    const result = translation.job?.result;
    const proposal: TextTranslationProposal | null =
        result && 'alignment' in result ? result : null;
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
        setExpired(false);
        await translation.start({
            folderId,
            sourceText: input.sourceText,
            sourceLanguage: TextLanguageSchema.parse(input.sourceLanguage),
            targetLanguage: TextLanguageSchema.parse(input.targetLanguage),
            operationId: crypto.randomUUID(),
            ...(document
                ? { textId: document.id, expectedTextVersion: document.version }
                : {}),
        });
    }
    useEffect(() => {
        detection.clear();
    }, [input.sourceText]);
    async function detect() {
        setSuggestionDismissed(false);
        await detection.start(
            {
                folderId,
                sourceText: input.sourceText,
                operationId: crypto.randomUUID(),
            },
            true,
        );
    }
    const { saving, saveError, save } = useTextWorkspaceSave({
        request,
        folderId,
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
    function discardProposal() {
        translation.clear();
        setExpired(false);
    }
    function updateMetadata(next: TextDocument) {
        setDocument(next);
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
        folder,
        remote,
        languages,
        document,
        input,
        setInput,
        mode,
        pairs,
        touched,
        saving,
        saveError,
        conflict,
        showErrors,
        translation,
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
