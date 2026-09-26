export {
    dictionaryApi,
    dictionaryAudioApi,
    DictionaryApiError,
    resolveDictionaryApiUrl,
    type DictionaryApi,
    type RequestWithSession,
} from './api/dictionary-api';
export {
    activeOptionalFields,
    authorshipMessageKey,
    languageForRole,
    languageDirection,
    languageLabel,
} from './lib/dictionary-display';
export { dictionaryErrorMessage } from './lib/dictionary-error-message';
export {
    toggleDeletionTarget,
    toggleLoadedDeletionTargets,
} from './lib/dictionary-deletion-selection';
