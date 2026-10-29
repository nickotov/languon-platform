import { createTextsCryptography } from './texts-composition';
import {
    TextLanguageSchema,
    type CopyKnowledgeTextRequest,
} from '@languon/contracts';
import type { DictionaryEntropySource } from '../../dictionaries/infrastructure/crypto/dictionary-cryptography';
import {
    publishLibraryText,
    type PreparedLibraryText,
} from './persistence/drizzle/text-library-publication';
import type {
    TextsContentDatabase,
    TextsContentTransaction,
} from './persistence/drizzle/text-content-support';
import { appendPreparedLibraryText } from './persistence/drizzle/text-library-publication';
import { text } from './persistence/drizzle/text-content-access';
import { assertTextVersion } from '../domain/text';

export function createTextLibraryPublication(options: {
    database: TextsContentDatabase;
    ids: { generate(): string };
    clock: { now(): Date };
    dictionaryHmacSecret: string | Uint8Array;
    entropy: DictionaryEntropySource;
}) {
    const persistence = {
        db: options.database,
        ids: options.ids,
        clock: options.clock,
        crypto: createTextsCryptography(
            options.dictionaryHmacSecret,
            options.entropy,
        ),
        proposal: undefined,
    };
    return {
        async preview(
            actorId: string,
            request: CopyKnowledgeTextRequest,
            signal: AbortSignal,
            resolve: (
                tx: TextsContentTransaction,
            ) => Promise<PreparedLibraryText>,
        ) {
            return options.database.transaction(async (tx) => {
                signal.throwIfAborted();
                const prepared = await resolve(tx);
                let content = {
                    sourceText: prepared.sourceText,
                    alignment: prepared.alignment,
                };
                let title: string;
                if (request.destination.kind === 'existing') {
                    const current = await text(
                        persistence,
                        tx,
                        actorId,
                        request.destination.textId,
                    );
                    assertTextVersion(
                        current.version,
                        request.destination.expectedVersion,
                    );
                    title = current.title;
                    content = appendPreparedLibraryText(
                        {
                            ...current,
                            sourceLanguage: TextLanguageSchema.parse(
                                current.sourceLanguage,
                            ),
                            targetLanguage: TextLanguageSchema.parse(
                                current.targetLanguage,
                            ),
                        },
                        prepared,
                    );
                } else title = request.destination.title;
                return {
                    text: {
                        title,
                        sourceLanguage: prepared.sourceLanguage,
                        targetLanguage: prepared.targetLanguage,
                        sourceText: content.sourceText,
                        alignment: content.alignment,
                    },
                    isNew: request.destination.kind === 'new',
                };
            });
        },
        publish(
            actorId: string,
            request: CopyKnowledgeTextRequest,
            fingerprint: string,
            signal: AbortSignal,
            resolve: (
                tx: TextsContentTransaction,
            ) => Promise<PreparedLibraryText>,
        ) {
            return publishLibraryText(
                persistence,
                actorId,
                request,
                fingerprint,
                signal,
                resolve,
            );
        },
    };
}
export type TextLibraryPublication = ReturnType<
    typeof createTextLibraryPublication
>;
