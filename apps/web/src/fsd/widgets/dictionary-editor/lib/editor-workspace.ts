import { DictionaryApiError } from '@/fsd/entities/dictionary';
import { isGenerationJobStale } from '@/fsd/features/dictionary-generation';
import type { useDictionaryEditorController } from '../hooks/use-dictionary-editor-controller';

export function deriveEditorWorkspace(
    model: ReturnType<typeof useDictionaryEditorController>,
) {
    const { setEditing } = model.state;
    const { languages, dictionary, cards } = model.queries;
    const { generationJob, generationCard } = model.jobs;
    const {
        updateSettings,
        lifecycle,
        share,
        cardMutation,
        cardLifecycleMutation,
        reorder,
        generationAction,
    } = model.mutations;

    const current = dictionary.data!.dictionary;

    const catalog = languages.data!.languages;

    const currentVersions = cards.data!.pages[0]!;

    const cardList = cards.data!.pages.flatMap((page) => page.data);

    const mutationError =
        updateSettings.error ??
        lifecycle.error ??
        cardMutation.error ??
        cardLifecycleMutation.error ??
        reorder.error ??
        share.error;

    const conflict =
        mutationError instanceof DictionaryApiError &&
        mutationError.detail.code === 'version_conflict';

    const generationConflict =
        (generationAction.error instanceof DictionaryApiError &&
            generationAction.error.detail.code === 'version_conflict') ||
        isGenerationJobStale(generationJob.data?.job, generationCard.data);

    async function reloadAfterConflict() {
        setEditing(null);
        updateSettings.reset();
        lifecycle.reset();
        cardMutation.reset();
        cardLifecycleMutation.reset();
        reorder.reset();
        share.reset();
        await Promise.all([dictionary.refetch(), cards.refetch()]);
    }

    return {
        current,
        catalog,
        currentVersions,
        cardList,
        mutationError,
        conflict,
        generationConflict,
        reloadAfterConflict,
    };
}
export type EditorController = ReturnType<typeof useDictionaryEditorController>;
export type EditorWorkspace = ReturnType<typeof deriveEditorWorkspace>;
export type EditorViewFields = EditorController['state'] &
    EditorController['queries'] &
    EditorController['jobs'] &
    EditorController['mutations'] &
    EditorController['draftActions'] &
    EditorWorkspace;
