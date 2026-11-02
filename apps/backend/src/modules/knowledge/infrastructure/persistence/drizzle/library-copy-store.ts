import type { KnowledgeLibraryCopyStore } from '../../../application/library-copy-store';
import type { KnowledgeShareCrypto } from '../../knowledge-share-crypto';
import type { PreparedDictionaryLibraryPublication } from '../../../../dictionaries/infrastructure/prepared-library-publication';
import type { TextLibraryPublication } from '../../../../texts/infrastructure/text-library-publication';
import { createVocabularyLibraryPublisher } from './library-copy-vocabulary';
import { createTextLibraryPublisher } from './library-copy-text';

export function createKnowledgeLibraryCopyStore(options: {
    dictionary: PreparedDictionaryLibraryPublication;
    texts: TextLibraryPublication;
    crypto: KnowledgeShareCrypto;
}): KnowledgeLibraryCopyStore {
    const vocabulary = createVocabularyLibraryPublisher(
        options.dictionary,
        options.crypto,
    );
    const texts = createTextLibraryPublisher(options.texts, options.crypto);

    return {
        previewVocabulary: vocabulary.preview,
        copyVocabulary: vocabulary.copy,
        previewText: texts.preview,
        copyText: texts.copy,
    };
}
