import { and, eq } from 'drizzle-orm';
import type { KnowledgeTransaction } from './knowledge-transaction';
import { knowledgePrivateTranslationsTable } from './private-translation-schema';
import {
    knowledgeLearningSourceFingerprint,
    knowledgeLearningSourceSnapshot,
} from './learning-source-binding';
import { createHash, randomUUID } from 'node:crypto';
import {
    TextAlignmentSchema,
    TextLanguageSchema,
    TextSourceSchema,
    KnowledgeTextLibraryPreviewSchema,
    type CopyKnowledgeTextRequest,
    type LearningBlock,
} from '@languon/contracts';
import type { LearnerSourceAccess } from '../../../application/learner-store';
import { KnowledgeDomainError } from '../../../domain/knowledge';
import type { KnowledgeShareCrypto } from '../../knowledge-share-crypto';
import { readLibraryCopyBlock } from './library-copy-source';
import type { TextLibraryPublication } from '../../../../texts/infrastructure/text-library-publication';
export function textLibraryContent(
    block: LearningBlock,
    translationLanguage: string,
    createId: () => string = randomUUID,
) {
    if (block.type !== 'bilingual-text')
        throw new KnowledgeDomainError(
            'invalid_request',
            'Select a bilingual text block.',
        );
    const translation = block.translations.find(
        (item) =>
            item.language.toLowerCase() === translationLanguage.toLowerCase(),
    );

    if (block.language.toLowerCase() === translationLanguage.toLowerCase())
        throw new KnowledgeDomainError(
            'invalid_request',
            'Choose a different translation language.',
        );
    const sourceText = TextSourceSchema.parse(
        block.segments.map((segment) => segment.text).join('\n\n'),
    );

    if (!translation)
        return {
            title: block.title ?? 'Copied text',
            sourceText,
            sourceLanguage: TextLanguageSchema.parse(block.language),
            targetLanguage: TextLanguageSchema.parse(translationLanguage),
            alignment: null,
        };
    const pairs = block.segments.map((segment) => ({
        segment,
        pairId: createId(),
    }));
    let offset = 0;
    let paragraphIndex = 0;
    const source = pairs.map(({ segment, pairId }, index) => {
        // Block passages render as separate paragraphs. Keep their boundary in
        // Texts' contiguous alignment by attaching it to the following pair.
        const text = (index === 0 ? '' : '\n\n') + segment.text;
        const row = {
            pairId,
            text,
            startOffset: offset,
            endOffset: offset + text.length,
            paragraphIndex,
        };

        offset += text.length;
        paragraphIndex += 1 + (segment.text.match(/\n\s*\n/gu) ?? []).length;

        return row;
    });
    const alignment = TextAlignmentSchema.parse({
        source,
        translation: pairs.map(({ segment, pairId }, index) => ({
            pairId,
            text:
                (index === 0 ? '' : '\n\n') +
                translation.segments.find(
                    (item) => item.sourceSegmentId === segment.id,
                )!.text,
        })),
        editedPairIds: pairs.map((pair) => pair.pairId),
    });

    return {
        title: block.title ?? 'Copied text',
        sourceText,
        sourceLanguage: TextLanguageSchema.parse(block.language),
        targetLanguage: TextLanguageSchema.parse(translation.language),
        alignment,
    };
}

async function resolveTextLibraryContent(
    tx: KnowledgeTransaction,
    crypto: KnowledgeShareCrypto,
    actorId: string,
    request: CopyKnowledgeTextRequest,
    access?: LearnerSourceAccess,
) {
    let block = await readLibraryCopyBlock(
        tx,
        crypto,
        actorId,
        request,
        access,
    );

    if (request.privateTranslation) {
        if (block.type !== 'bilingual-text')
            throw new KnowledgeDomainError(
                'invalid_request',
                'Select a text block.',
            );
        const fingerprint = knowledgeLearningSourceFingerprint(
            knowledgeLearningSourceSnapshot(block),
        );
        const [overlay] = await tx
            .select()
            .from(knowledgePrivateTranslationsTable)
            .where(
                and(
                    eq(knowledgePrivateTranslationsTable.actorId, actorId),
                    eq(
                        knowledgePrivateTranslationsTable.noteId,
                        request.noteId,
                    ),
                    eq(knowledgePrivateTranslationsTable.blockId, block.id),
                    eq(
                        knowledgePrivateTranslationsTable.targetLanguage,
                        request.translationLanguage,
                    ),
                    eq(
                        knowledgePrivateTranslationsTable.sourceFingerprint,
                        fingerprint,
                    ),
                ),
            )
            .for('share');

        if (
            !overlay ||
            fingerprint !== request.privateTranslation.sourceFingerprint ||
            overlay.updatedAt.toISOString() !==
                request.privateTranslation.updatedAt
        )
            throw new KnowledgeDomainError(
                'version_conflict',
                'The private translation changed. Preview the copy again.',
            );
        block = {
            ...block,
            translations: [
                {
                    language: request.translationLanguage,
                    segments: overlay.segments,
                },
            ],
        };
    }

    return textLibraryContent(block, request.translationLanguage);
}

export function createTextLibraryPublisher(
    publication: TextLibraryPublication,
    crypto: KnowledgeShareCrypto,
) {
    return {
        async preview(
            actorId: string,
            request: CopyKnowledgeTextRequest,
            signal: AbortSignal,
            access?: LearnerSourceAccess,
        ) {
            return KnowledgeTextLibraryPreviewSchema.parse(
                await publication.preview(
                    actorId,
                    request,
                    signal,
                    async (tx) =>
                        resolveTextLibraryContent(
                            tx,
                            crypto,
                            actorId,
                            request,
                            access,
                        ),
                ),
            );
        },
        async copy(
            actorId: string,
            request: CopyKnowledgeTextRequest,
            signal: AbortSignal,
            access?: LearnerSourceAccess,
        ) {
            const fingerprint = createHash('sha256')
                .update(
                    JSON.stringify({ kind: 'knowledge-text-copy', request }),
                )
                .digest('hex');

            return publication.publish(
                actorId,
                request,
                fingerprint,
                signal,
                async (tx) =>
                    resolveTextLibraryContent(
                        tx,
                        crypto,
                        actorId,
                        request,
                        access,
                    ),
            );
        },
    };
}
