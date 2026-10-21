import type {
    MoveTextRequest,
    TextDocument,
    TextTranslationProposal,
} from '@languon/contracts';
import { useRef, useState } from 'react';
import {
    textsApi,
    TextsApiError,
    type RequestWithTextSession,
} from '@/fsd/entities/texts';
import {
    workspaceValid,
    type WorkspaceInput,
    type WorkspacePair,
} from '../lib/workspace-content';
import { persistWorkspace } from '../lib/workspace-save';
type Options = {
    request: RequestWithTextSession;
    folderId: string | null;
    sharedFolderConfirmation?: MoveTextRequest['sharedFolderConfirmation'];
    document: TextDocument | null;
    input: WorkspaceInput;
    mode: 'compose' | 'read' | 'edit';
    pairs: WorkspacePair[];
    proposal: TextTranslationProposal | null;
    previewExpired: boolean;
    conflict: TextDocument | null;
    setShowErrors(value: boolean): void;
    setExpired(value: boolean): void;
    setConflict(value: TextDocument): void;
    setDocument(value: TextDocument): void;
    adopt(value: TextDocument): void;
    clearProposal(): void;
    isCurrent?(): boolean;
};
export function useTextWorkspaceSave(options: Options) {
    const {
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
        clearProposal,
        isCurrent,
    } = options;
    const [saving, setSaving] = useState(false);
    const [failure, setFailure] = useState<{
        fingerprint: string;
        error: unknown;
    } | null>(null);
    const fingerprint = JSON.stringify({ input, mode, pairs, proposal });
    const saveError =
        failure?.fingerprint === fingerprint ? failure.error : null;
    const saveLock = useRef(false);
    const creationOperation = useRef<{
        fingerprint: string;
        id: string;
    } | null>(null);

    function clearSaveError() {
        setFailure(null);
    }

    async function save(keepMine = false): Promise<boolean> {
        if (saveLock.current) return false;
        if (
            mode === 'compose' &&
            !proposal &&
            (input.sourceLanguage === 'auto' || !workspaceValid(input))
        ) {
            setShowErrors(true);
            return false;
        }
        if (
            mode === 'edit' &&
            pairs.some(
                (pair) => !pair.source.trim() || !pair.translation.trim(),
            )
        ) {
            setShowErrors(true);
            return false;
        }
        if (proposal && previewExpired) return false;
        setShowErrors(false);
        saveLock.current = true;
        setSaving(true);
        clearSaveError();
        try {
            const fingerprint = JSON.stringify({ folderId, ...input });
            if (creationOperation.current?.fingerprint !== fingerprint)
                creationOperation.current = {
                    fingerprint,
                    id: crypto.randomUUID(),
                };
            const next = await persistWorkspace({
                operationId: creationOperation.current.id,
                request,
                folderId,
                ...(options.sharedFolderConfirmation
                    ? {
                          sharedFolderConfirmation:
                              options.sharedFolderConfirmation,
                      }
                    : {}),
                document,
                input,
                proposal,
                pairs,
                editing: mode === 'edit',
                reviewedVersion: keepMine && conflict ? conflict.version : null,
                onCreated: setDocument,
            });
            if (isCurrent && !isCurrent()) return false;
            adopt(next);
            clearProposal();
            return true;
        } catch (error) {
            setFailure({ fingerprint, error });
            if (
                error instanceof TextsApiError &&
                error.detail.code === 'generation_proposal_expired'
            )
                setExpired(true);
            if (
                error instanceof TextsApiError &&
                error.detail.code === 'version_conflict' &&
                document
            ) {
                try {
                    setConflict(
                        (
                            await request((token) =>
                                textsApi.getText(token, document.id),
                            )
                        ).text,
                    );
                } catch {
                    /* Preserve edits and original error. */
                }
            }
            return false;
        } finally {
            saveLock.current = false;
            setSaving(false);
        }
    }
    return { saving, saveError, save, clearSaveError };
}
