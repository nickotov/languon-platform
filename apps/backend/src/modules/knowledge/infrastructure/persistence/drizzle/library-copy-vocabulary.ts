import { createHash } from 'node:crypto';
import {
    type CopyKnowledgeVocabularyRequest,
    type LearningBlock,
} from '@languon/contracts';
import type { LearnerSourceAccess } from '../../../application/learner-store';
import { KnowledgeDomainError } from '../../../domain/knowledge';
import type { KnowledgeShareCrypto } from '../../knowledge-share-crypto';
import type {
    PreparedDictionaryLibraryPublication,
    PreparedDictionaryImportRow,
} from '../../../../dictionaries/infrastructure/prepared-library-publication';
import { normalizeCardValues } from '../../../../dictionaries/domain/limits';
import { readLibraryCopyBlock } from './library-copy-source';

export function vocabularyLibraryRows(
    block: LearningBlock,
    entryIds: readonly string[],
) {
    if (block.type !== 'vocabulary')
        throw new KnowledgeDomainError(
            'invalid_request',
            'Select a vocabulary block.',
        );
    const entries = entryIds.map((id) => {
        const entry = block.entries.find((item) => item.id === id);
        if (!entry)
            throw new KnowledgeDomainError(
                'invalid_request',
                'A selected vocabulary entry is unavailable.',
            );

        return entry;
    });
    const rows: PreparedDictionaryImportRow[] = entries.map(
        (entry, rowIndex) => {
            const values = normalizeCardValues({
                source: entry.term,
                translation: entry.translation,
                transcription: entry.pronunciation ?? null,
                example: entry.example ?? null,
                exampleTranslation: entry.exampleTranslation ?? null,
                definition: entry.definition ?? null,
            });

            return {
                rowIndex: rowIndex + 1,
                source: values.source,
                translation: values.translation,
                prepared: {
                    transcription: values.transcription,
                    example: values.example,
                    exampleTranslation: values.exampleTranslation,
                    definition: values.definition,
                },
            };
        },
    );

    return {
        entries,
        rows,
        sourceLanguage: block.language,
        targetLanguage: block.translationLanguage,
    };
}

export function createVocabularyLibraryPublisher(
    publication: PreparedDictionaryLibraryPublication,
    crypto: KnowledgeShareCrypto,
) {
    return {
        async preview(
            actorId: string,
            request: CopyKnowledgeVocabularyRequest,
            signal: AbortSignal,
            access?: LearnerSourceAccess,
        ) {
            const result = await publication.preview(
                {
                    context: { now: new Date(), signal },
                    ownerId: actorId,
                    idempotencyKey: request.operationId,
                    fingerprint: 'preview',
                    target: request.destination,
                },
                async (tx) =>
                    vocabularyLibraryRows(
                        await readLibraryCopyBlock(
                            tx,
                            crypto,
                            actorId,
                            request,
                            access,
                        ),
                        request.entryIds,
                    ),
            );

            return {
                entries: result.prepared.rows.map((row, index) => ({
                    id: request.entryIds[index]!,
                    term: row.source,
                    translation: row.translation,
                    ...(row.prepared?.transcription
                        ? { pronunciation: row.prepared.transcription }
                        : {}),
                    ...(row.prepared?.definition
                        ? { definition: row.prepared.definition }
                        : {}),
                    ...(row.prepared?.example
                        ? { example: row.prepared.example }
                        : {}),
                    ...(row.prepared?.exampleTranslation
                        ? {
                              exampleTranslation:
                                  row.prepared.exampleTranslation,
                          }
                        : {}),
                })),
                remainingRows: result.capacity.remainingRows,
            };
        },
        async copy(
            actorId: string,
            request: CopyKnowledgeVocabularyRequest,
            signal: AbortSignal,
            access?: LearnerSourceAccess,
        ) {
            return publication.publish(
                {
                    context: {
                        now: new Date(),
                        signal: signal,
                    },
                    ownerId: actorId,
                    idempotencyKey: request.operationId,
                    fingerprint: createHash('sha256')
                        .update(
                            JSON.stringify({
                                kind: 'knowledge-vocabulary-copy',
                                request,
                            }),
                        )
                        .digest('hex'),
                    target: request.destination,
                },
                async (tx) =>
                    vocabularyLibraryRows(
                        await readLibraryCopyBlock(
                            tx,
                            crypto,
                            actorId,
                            request,
                            access,
                        ),
                        request.entryIds,
                    ),
            );
        },
    };
}
