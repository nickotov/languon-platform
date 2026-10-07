import type {
    SentenceLibraryDetail,
    SentenceLibraryItem,
} from '@languon/contracts';
import type { SavedSentence, LibraryHint } from '../types';
export function displayItem(item: SentenceLibraryItem): SavedSentence {
    return {
        id: item.exerciseId,
        dictionaryId: item.dictionaryId,
        sentenceLanguage: item.sourceLanguage,
        answerLanguage: item.targetLanguage,
        sentence: item.sourceText,
        reference: '',
        dictionaryHints: [],
        contextHints: [],
        createdAt: item.createdAt,
        ownership: item.sharing === 'private' ? 'mine' : 'shared',
        outdated: item.contentState === 'outdated',
        archivedByMe: item.personalArchivedAt !== null,
        globallyArchived: item.globalArchivedAt !== null,
        enrichment: 'legacy',
        version: item.version,
    };
}
export function displayDetail(detail: SentenceLibraryDetail): SavedSentence {
    const value = displayItem(detail.item);
    value.reference = detail.referenceTranslation;
    value.enrichment =
        detail.exercise.generationPolicyVersion === 2 ? 'rich' : 'legacy';
    for (const hint of detail.exercise.hints) {
        const segments = detail.exercise.segments.filter(
            (s) =>
                s.target?.hintId === hint.id || s.contextualHintId === hint.id,
        );
        const first = segments[0];
        let source = first?.text ?? '';
        if (
            first &&
            Number.isFinite(first.start) &&
            Number.isFinite(first.end)
        ) {
            let end = first.end;
            for (const next of segments.slice(1)) {
                if (next.start !== end) break;
                end = next.end;
            }
            source = Array.from(detail.item.sourceText)
                .slice(first.start, end)
                .join('');
        }
        const display: LibraryHint = {
            id: hint.id,
            source,
            target: hint.text,
            kind: /\s/.test(source) ? 'phrase' : 'word',
        };
        if (hint.kind === 'contextual') value.contextHints.push(display);
        else value.dictionaryHints.push(display);
    }
    return value;
}
