import type { LearningBlock } from '@languon/contracts';
import type { SourceMaterial } from '../domain/conversation';

/** Structural IDs travel with each segment, including when large text is excerpted later. */
export function learningBlockSourceMaterial(
    blocks: readonly LearningBlock[],
): SourceMaterial[] {
    return blocks.flatMap((block): SourceMaterial[] => {
        const label = `Learning block ${block.id} (${block.type})`;
        const item = (
            id: string,
            itemLabel: string,
            content: unknown,
        ): SourceMaterial => ({
            id,
            kind: 'text',
            label: itemLabel,
            content: JSON.stringify(content),
        });
        if (
            (block.type === 'audio' || block.type === 'video') &&
            block.transcript
        ) {
            const { transcript, ...metadata } = block;
            return [
                item(block.id, label, {
                    ...metadata,
                    transcript: {
                        language: transcript.language,
                        segmentCount: transcript.segments.length,
                    },
                }),
                ...transcript.segments.map((segment) =>
                    item(
                        segment.id,
                        `Block ${block.id}; segment ${segment.id}`,
                        { blockId: block.id, segment },
                    ),
                ),
            ];
        }
        if (block.type === 'bilingual-text') {
            const { segments, translations, ...metadata } = block;
            return [
                item(block.id, label, {
                    ...metadata,
                    segmentCount: segments.length,
                    translationLanguages: translations.map(
                        (translation) => translation.language,
                    ),
                }),
                ...segments.map((segment) =>
                    item(
                        segment.id,
                        `Block ${block.id}; segment ${segment.id}`,
                        {
                            blockId: block.id,
                            segment,
                            translations: translations.map((translation) => ({
                                language: translation.language,
                                text: translation.segments.find(
                                    (part) =>
                                        part.sourceSegmentId === segment.id,
                                )?.text,
                            })),
                        },
                    ),
                ),
            ];
        }
        return [item(block.id, label, block)];
    });
}
