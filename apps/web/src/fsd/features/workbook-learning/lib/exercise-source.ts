import type {
    KnowledgeBody,
    LearningBlock,
    LearningTranscript,
} from '@languon/contracts';

export function exerciseSource(
    block: LearningBlock,
    body?: KnowledgeBody,
): {
    block?: LearningBlock;
    transcript?: LearningTranscript;
    audioAssetId?: string;
    videoSource?: Extract<LearningBlock, { type: 'video' }>['source'];
} {
    if (block.type !== 'exercise' || !block.source || !body) return {};
    const source = block.source;
    let media: LearningBlock | undefined;
    function visit(
        node: NonNullable<KnowledgeBody['document']['content']>[number],
    ) {
        if (
            node.type === 'learningBlock' &&
            node.attrs?.block?.id === source.blockId
        )
            media = node.attrs.block;
        node.content?.forEach(visit);
    }
    body.document.content?.forEach(visit);
    if (!media) return {};
    const ids = new Set(source.segmentIds);
    if (media.type === 'bilingual-text') {
        const segments = media.segments.filter((segment) =>
            ids.has(segment.id),
        );
        if (segments.length !== ids.size) return {};
        return {
            block: media,
            transcript: {
                language: media.language,
                segments: segments.map(({ id, text }) => ({ id, text })),
            },
        };
    }
    if (
        !media ||
        (media.type !== 'audio' && media.type !== 'video') ||
        !media.transcript
    )
        return {};
    const segments = media.transcript.segments.filter((segment) =>
        ids.has(segment.id),
    );
    if (segments.length !== ids.size) return {};
    return {
        block: media,
        transcript: { language: media.transcript.language, segments },
        ...(media.type === 'audio'
            ? { audioAssetId: media.assetId }
            : { videoSource: media.source }),
    };
}
