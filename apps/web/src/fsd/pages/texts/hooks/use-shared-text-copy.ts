import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { TextFolder } from '@languon/contracts';
import { textsApi, type RequestWithTextSession } from '@/fsd/entities/texts';
import { useSessionStore } from '@/fsd/entities/session';

export type SharedCopyTarget = {
    mode: 'text' | 'folder';
    textId?: string;
    version?: number;
    defaultName: string;
    total: number;
};

export function useSharedTextCopy({
    target,
    kind,
    shareId,
    shareKey,
    requestWithSession,
    onDone,
}: {
    target: SharedCopyTarget;
    kind: 'text' | 'folder';
    shareId: string;
    shareKey: string;
    requestWithSession: RequestWithTextSession;
    onDone(folderId: string): void;
}) {
    const userId = useSessionStore((state) => state.user?.id);
    const client = useQueryClient();
    const authority = useRef(0);
    const mounted = useRef(true);
    const controller = useRef<AbortController | null>(null);
    const [destination, setDestination] = useState(
        target.mode === 'text' ? 'independent' : 'new',
    );
    const [name, setName] = useState(target.defaultName);
    const [folderId, setFolderId] = useState('');
    const [confirmedShare, setConfirmedShare] = useState<string | null>(null);
    const [state, setState] = useState<'idle' | 'working' | 'failed'>('idle');
    const operation = useRef<{ fingerprint: string; id: string } | null>(null);
    const busy = useRef(false);

    useEffect(() => {
        mounted.current = true;
        const unsubscribe = useSessionStore.subscribe((next, previous) => {
            if (
                next.user?.id === previous.user?.id &&
                next.session?.id === previous.session?.id &&
                next.status === previous.status
            )
                return;
            authority.current += 1;
            controller.current?.abort();
            busy.current = false;
            operation.current = null;
            setDestination(target.mode === 'text' ? 'independent' : 'new');
            setFolderId('');
            setConfirmedShare(null);
            setName(target.defaultName);
            setState('idle');
        });
        return () => {
            mounted.current = false;
            authority.current += 1;
            controller.current?.abort();
            unsubscribe();
        };
    }, [target.defaultName]);

    function allowed(epoch: number) {
        return (
            mounted.current &&
            authority.current === epoch &&
            useSessionStore.getState().user?.id === userId
        );
    }

    function assertActor(epoch: number) {
        if (!allowed(epoch)) throw new Error('Copy authority changed');
    }

    const folders = useQuery({
        queryKey: ['texts', userId, 'copy-destinations'],
        queryFn: async ({ signal }) => {
            const epoch = authority.current;
            const result: TextFolder[] = [];
            let cursor: string | undefined;
            do {
                const page = await requestWithSession((token) => {
                    assertActor(epoch);
                    return textsApi.listFolders(
                        token,
                        {
                            lifecycle: 'active',
                            limit: 100,
                            ...(cursor ? { cursor } : {}),
                        },
                        signal,
                    );
                });
                assertActor(epoch);
                result.push(...page.data);
                cursor = page.nextCursor ?? undefined;
            } while (cursor);
            return result;
        },
    });

    const selectedFolder =
        destination === 'existing'
            ? folders.data?.find((folder) => folder.id === folderId)
            : undefined;
    const shareSnapshot = selectedFolder?.isShared
        ? `${selectedFolder.shareId}:${selectedFolder.shareVersion}`
        : null;
    const needsConfirmation = Boolean(
        shareSnapshot && confirmedShare !== shareSnapshot,
    );
    function confirmShare(value: boolean) {
        setConfirmedShare(value ? shareSnapshot : null);
    }
    const overLimit = target.mode === 'folder' && target.total > 500;
    const validDestination =
        destination === 'independent' ||
        (destination === 'existing' ? Boolean(folderId) : Boolean(name.trim()));

    const valid = validDestination && !needsConfirmation;
    async function submit() {
        if (busy.current || overLimit || !valid || !allowed(authority.current))
            return;
        const fingerprint = JSON.stringify({
            destination,
            folderId,
            name: name.trim(),
        });
        if (!operation.current || operation.current.fingerprint !== fingerprint)
            operation.current = { fingerprint, id: crypto.randomUUID() };
        const epoch = authority.current;
        assertActor(epoch);
        const abort = new AbortController();
        controller.current = abort;
        busy.current = true;
        setState('working');
        try {
            const operationId = operation.current.id;
            const destinationBody = copyDestination(
                destination,
                folderId,
                name,
            );
            const result = await requestWithSession((token) => {
                assertActor(epoch);
                if (target.mode === 'folder')
                    return textsApi.copySharedFolder(
                        token,
                        shareId,
                        shareKey,
                        {
                            operationId,
                            newFolderName: name.trim(),
                        },
                        abort.signal,
                    );
                const body = {
                    operationId,
                    expectedVersion: target.version!,
                    ...destinationBody,
                    ...(shareSnapshot &&
                    selectedFolder?.shareId &&
                    selectedFolder.shareVersion != null
                        ? {
                              sharedFolderConfirmation: {
                                  shareId: selectedFolder.shareId,
                                  shareVersion: selectedFolder.shareVersion,
                              },
                          }
                        : {}),
                };
                if (kind === 'folder')
                    return textsApi.copySharedFolderText(
                        token,
                        shareId,
                        shareKey,
                        target.textId!,
                        body,
                        abort.signal,
                    );
                return textsApi.copySharedText(
                    token,
                    shareId,
                    shareKey,
                    body,
                    abort.signal,
                );
            });
            assertActor(epoch);
            let destinationId = result.id;
            if (target.mode === 'text') {
                const copied = await requestWithSession((token) => {
                    assertActor(epoch);
                    return textsApi.getText(token, result.id, abort.signal);
                });
                assertActor(epoch);
                destinationId = copied.text.folderId ?? '';
            }
            await Promise.all([
                client.invalidateQueries({ queryKey: ['texts', userId] }),
                client.invalidateQueries({
                    queryKey: ['library-navigation', userId],
                }),
            ]);
            assertActor(epoch);
            onDone(destinationId);
        } catch {
            if (allowed(epoch)) setState('failed');
        } finally {
            if (allowed(epoch)) busy.current = false;
        }
    }

    return {
        folders,
        needsConfirmation,
        sharedDestination: Boolean(shareSnapshot),
        confirmedShare: Boolean(
            shareSnapshot && confirmedShare === shareSnapshot,
        ),
        confirmShare,
        destination,
        setDestination,
        name,
        setName,
        folderId,
        setFolderId,
        state,
        overLimit,
        valid,
        submit,
    };
}

function copyDestination(
    destination: string,
    folderId: string,
    name: string,
): { folderId: string | null } | { newFolderName: string } {
    if (destination === 'independent') return { folderId: null };
    if (destination === 'existing') return { folderId };
    return { newFolderName: name.trim() };
}
