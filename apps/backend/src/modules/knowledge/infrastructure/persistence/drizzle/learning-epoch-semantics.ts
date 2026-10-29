import { createHash } from 'node:crypto';
import { KnowledgeBodySchema, type LearningBlock } from '@languon/contracts';
import { exerciseSemanticRevision } from '../../../domain/workbook-learning';

export type LearningEpochIdentity = {
    kind: 'exercise' | 'vocabulary';
    blockId: string;
    itemId: string;
    semanticFingerprint: string;
};
export function vocabularySemanticFingerprint(
    block: Extract<LearningBlock, { type: 'vocabulary' }>,
    entry: Extract<LearningBlock, { type: 'vocabulary' }>['entries'][number],
) {
    return createHash('sha256')
        .update(
            JSON.stringify({
                descriptorVersion: 1,
                sourceLanguage: block.language,
                targetLanguage: block.translationLanguage,
                term: entry.term,
                translation: entry.translation,
                pronunciation: entry.pronunciation ?? null,
                definition: entry.definition ?? null,
                example: entry.example ?? null,
                exampleTranslation: entry.exampleTranslation ?? null,
            }),
        )
        .digest('hex');
}

export function publishedLearningIdentities(
    body: unknown,
): LearningEpochIdentity[] {
    const parsed = KnowledgeBodySchema.parse(body);
    if (parsed.schemaVersion === 1) return [];
    const blocks = (parsed.document.content ?? []).flatMap((node) =>
        node.type === 'learningBlock' && node.attrs?.block
            ? [node.attrs.block]
            : [],
    );

    return blocks.flatMap<LearningEpochIdentity>((block) => {
        if (block.type === 'exercise')
            return [
                {
                    kind: 'exercise' as const,
                    blockId: block.id,
                    itemId: block.id,
                    semanticFingerprint: exerciseSemanticRevision(
                        block,
                        blocks,
                    ),
                },
            ];
        if (block.type === 'vocabulary')
            return block.entries.map((entry) => ({
                kind: 'vocabulary' as const,
                blockId: block.id,
                itemId: entry.id,
                semanticFingerprint: vocabularySemanticFingerprint(
                    block,
                    entry,
                ),
            }));

        return [];
    });
}
