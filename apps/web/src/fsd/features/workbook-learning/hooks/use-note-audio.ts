import { useEffect, useState } from 'react';
import type {
    KnowledgeBody,
    WorkbookLearningShareAccess,
} from '@languon/contracts';
import { readKnowledgeAudio } from '@/fsd/entities/knowledge';
import type { WorkbookLearningOptions } from './use-workbook-learning';

function audioAssets(body: KnowledgeBody | undefined): string[] {
    const ids = new Set<string>();
    function visit(
        node: NonNullable<KnowledgeBody['document']['content']>[number],
    ) {
        if (
            node.type === 'learningBlock' &&
            node.attrs?.block?.type === 'audio'
        )
            ids.add(node.attrs.block.assetId);
        node.content?.forEach(visit);
    }
    body?.document.content?.forEach(visit);
    return [...ids];
}
export function useNoteAudio({
    noteId,
    body,
    access,
    requestWithSession,
    actorId,
    unavailable,
}: {
    noteId: string;
    body: KnowledgeBody | undefined;
    access: WorkbookLearningShareAccess | undefined;
    requestWithSession: WorkbookLearningOptions['requestWithSession'];
    actorId: string | undefined;
    unavailable: boolean;
}) {
    const assetKey = audioAssets(body).join(',');
    const [urls, setUrls] = useState<Record<string, string>>({});
    const accessKind = access?.kind;
    const accessLocator = access?.locator;
    const accessKey = access?.key;
    useEffect(() => {
        const controller = new AbortController();
        const created: string[] = [];
        const grant =
            accessKind && accessLocator && accessKey
                ? { kind: accessKind, locator: accessLocator, key: accessKey }
                : undefined;
        setUrls({});
        if (!assetKey || unavailable || (!actorId && !grant))
            return () => controller.abort();
        const assets = assetKey.split(',');
        async function load(assetId: string) {
            try {
                const options = { access: grant, signal: controller.signal };
                const blob = actorId
                    ? await requestWithSession((token) =>
                          readKnowledgeAudio(noteId, assetId, {
                              ...options,
                              token,
                          }),
                      )
                    : await readKnowledgeAudio(noteId, assetId, options);
                if (controller.signal.aborted) return;
                const url = URL.createObjectURL(blob);
                created.push(url);
                setUrls((current) => ({ ...current, [assetId]: url }));
            } catch {
                /* The renderer shows media unavailable without exposing server details. */
            }
        }
        async function drain() {
            while (!controller.signal.aborted) {
                const assetId = assets.shift();
                if (!assetId) return;
                await load(assetId);
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
    ]);
    return unavailable ? {} : urls;
}
