import {
    HmacDictionaryCryptography,
    type DictionaryEntropySource,
} from './crypto/dictionary-cryptography';
import { InvalidDictionaryRequestError } from '../application/dictionary-errors';
import { readOwnedState } from './persistence/drizzle/dictionary-aggregate-state';
import type { DictionaryStore } from '../application/ports/dictionary-store';
import { dictionaryLimits, type DictionaryOwnerLimits } from '../domain/limits';
import type { DictionaryDatabase } from './persistence/drizzle/dictionary-context';
import type { DictionaryIdGenerator } from './persistence/drizzle/dictionary-id-generator';
import {
    importDictionary,
    previewDictionaryImport,
    type PrepareDictionaryImport,
} from './persistence/drizzle/dictionary-import';

type Input = Parameters<DictionaryStore['importDictionary']>[0];
export function createPreparedDictionaryLibraryPublication(options: {
    database: DictionaryDatabase;
    ids: DictionaryIdGenerator;
    ownerLimits?: DictionaryOwnerLimits;
    dictionaryHmacSecret: string | Uint8Array;
    entropy: DictionaryEntropySource;
}) {
    const cryptography = new HmacDictionaryCryptography({
        secret: options.dictionaryHmacSecret,
        entropy: options.entropy,
    });
    const context = {
        database: options.database,
        ids: options.ids,
        ownerLimits: options.ownerLimits ?? dictionaryLimits,
    };
    return {
        async preview(
            input: Omit<Input, 'rows'>,
            prepare: PrepareDictionaryImport,
        ) {
            return options.database.transaction(async (tx) => {
                const prepared = await prepare(tx);
                const languages =
                    input.target.kind === 'new'
                        ? {
                              source: input.target.sourceLanguage,
                              target: input.target.targetLanguage,
                          }
                        : await readOwnedState(
                              tx,
                              input.ownerId,
                              input.target.dictionaryId,
                          ).then((current) => ({
                              source: current.dictionary.sourceLanguageTag,
                              target: current.dictionary.targetLanguageTag,
                          }));
                if (
                    languages.source !== prepared.sourceLanguage ||
                    languages.target !== prepared.targetLanguage
                )
                    throw new InvalidDictionaryRequestError();
                const capacity = await previewDictionaryImport(context, {
                    ...input,
                    rows: prepared.rows,
                });
                return { prepared, capacity };
            });
        },
        publish(input: Omit<Input, 'rows'>, prepare: PrepareDictionaryImport) {
            return importDictionary(
                context,
                {
                    ...input,
                    fingerprint: cryptography.fingerprint({
                        kind: 'prepared-library-import',
                        request: input.fingerprint,
                    }),
                    rows: [],
                },
                prepare,
            );
        },
    };
}
export type PreparedDictionaryLibraryPublication = ReturnType<
    typeof createPreparedDictionaryLibraryPublication
>;

export type { PreparedDictionaryImportRow } from './persistence/drizzle/dictionary-import';
