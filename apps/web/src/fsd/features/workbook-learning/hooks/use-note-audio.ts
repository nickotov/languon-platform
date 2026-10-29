import type {
    KnowledgeBody,
    WorkbookLearningShareAccess,
} from '@languon/contracts';
import { useKnowledgeAudioUrls } from '@/fsd/entities/knowledge';
import type { WorkbookLearningOptions } from './use-workbook-learning';

function audioAssets(body: KnowledgeBody | undefined): string[] {
    const ids = new Set<string>();
    function visit(
        node: NonNullable<KnowledgeBody['document']['content']>[number],
    ) {
        if (
            node.type === 'learningBlock' &&
            node.attrs?.block?.type === 'audio' &&
            node.attrs.block.assetId
        )
            ids.add(node.attrs.block.assetId);
        node.content?.forEach(visit);
    }
    body?.document.content?.forEach(visit);
    return [...ids];
}
export function useNoteAudio(options: {
    noteId: string;
    body: KnowledgeBody | undefined;
    access: WorkbookLearningShareAccess | undefined;
    requestWithSession: WorkbookLearningOptions['requestWithSession'];
    actorId: string | undefined;
    unavailable: boolean;
}) {
    return useKnowledgeAudioUrls({
        ...options,
        assetIds: audioAssets(options.body),
    });
}
