import type { SentenceLibraryStore } from '../../../learning/application/ports/sentence-library-store';

/** Learning owns saved sentence semantics; administration owns actor authorization and audit. */
export type AdminSentenceLibrary = Pick<
    SentenceLibraryStore,
    | 'adminDictionaries'
    | 'adminList'
    | 'adminDetail'
    | 'adminSnapshot'
    | 'adminMutate'
>;
