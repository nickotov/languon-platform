'use client';
import { useEffect, useState } from 'react';
import type { KnowledgeMediaAccess } from '@languon/contracts';
import { readKnowledgeAudio } from '../api/knowledge-media-api';

type SessionRequest = <T>(
    operation: (token: string) => Promise<T>,
) => Promise<T>;
export interface KnowledgeAudioUrlsOptions {
    noteId: string | undefined;
    assetIds: readonly string[];
    access: KnowledgeMediaAccess | undefined;
    requestWithSession: SessionRequest;
    actorId: string | undefined;
    unavailable: boolean;
}
/** Authorized bytes only. URLs are local, scope-bound and revoked on teardown. */
export function useKnowledgeAudioUrls({
    noteId,
    assetIds,
    access,
    requestWithSession,
    actorId,
    unavailable,
}: KnowledgeAudioUrlsOptions) {
    const assetKey = [...new Set(assetIds)].sort().join(',');
    const accessKind = access?.kind;
    const accessLocator = access?.locator;
    const accessKey = access?.key;
    const scopeKey = JSON.stringify([
        noteId,
        assetKey,
        accessKind,
        accessLocator,
        accessKey,
        actorId,
        unavailable,
    ]);
    const [state, setState] = useState<{
        scopeKey: string;
        urls: Record<string, string>;
    }>({ scopeKey, urls: {} });
    useEffect(() => {
        const controller = new AbortController();
        const created: string[] = [];
        setState({ scopeKey, urls: {} });
        const grant =
            accessKind && accessLocator && accessKey
                ? { kind: accessKind, locator: accessLocator, key: accessKey }
                : undefined;
        if (!noteId || !assetKey || unavailable || (!actorId && !grant))
            return () => controller.abort();
        const assets = assetKey.split(',');
        async function load(assetId: string) {
            try {
                const options = { access: grant, signal: controller.signal };
                const blob = actorId
                    ? await requestWithSession((token) =>
                          readKnowledgeAudio(noteId!, assetId, {
                              ...options,
                              token,
                          }),
                      )
                    : await readKnowledgeAudio(noteId!, assetId, options);
                if (controller.signal.aborted) return;
                const url = URL.createObjectURL(blob);
                created.push(url);
                setState((current) =>
                    current.scopeKey === scopeKey
                        ? {
                              ...current,
                              urls: { ...current.urls, [assetId]: url },
                          }
                        : current,
                );
            } catch {
                /* Missing or revoked media remains explicitly unavailable. */
            }
        }
        async function drain() {
            while (!controller.signal.aborted) {
                const asset = assets.shift();
                if (!asset) return;
                await load(asset);
            }
        }
        void drain();
        void drain();
        return () => {
            controller.abort();
            for (const url of created) URL.revokeObjectURL(url);
        };
    }, [
        noteId,
        assetKey,
        accessKind,
        accessLocator,
        accessKey,
        actorId,
        requestWithSession,
        unavailable,
        scopeKey,
    ]);
    return state.scopeKey === scopeKey && !unavailable ? state.urls : {};
}
