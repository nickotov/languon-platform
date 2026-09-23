import type { RequestWithSession } from '@/fsd/entities/dictionary';
import { useAuthoringCleanup } from './use-authoring-cleanup';
import { useAuthoringJob } from './use-authoring-job';
import { useAuthoringMutation } from './use-authoring-mutation';
import { useBatchJob } from './use-batch-job';
import { useBatchMutation } from './use-batch-mutation';
import { useCardLifecycle } from './use-card-lifecycle';
import { useCardMutation } from './use-card-mutation';
import { useDictionaryMutations } from './use-dictionary-mutations';
import { useDocumentJob } from './use-document-job';
import { useDocumentMutation } from './use-document-mutation';
import { useDraftDismissal } from './use-draft-dismissal';
import { useEditorQueries } from './use-editor-queries';
import { useEditorState } from './use-editor-state';
import { useGenerationJob } from './use-generation-job';
import { useGenerationMutation } from './use-generation-mutation';
import { useInterchangeMutations } from './use-interchange-mutations';

export function useDictionaryEditorController(
    dictionaryId: string,
    requestWithSession: RequestWithSession,
) {
    const state = useEditorState(dictionaryId, requestWithSession);

    const queries = useEditorQueries(state);

    const workspace = { ...state, ...queries };

    const jobs = {
        ...useAuthoringJob(workspace),
        ...useBatchJob(workspace),
        ...useDocumentJob(workspace),
        ...useGenerationJob(workspace),
    };

    const context = { ...workspace, ...jobs };

    const cleanup = useAuthoringCleanup(context);

    const mutations = {
        ...useDictionaryMutations(context),
        ...useCardMutation({ ...context, ...cleanup }),
        ...useAuthoringMutation(context),
        ...useCardLifecycle(context),
        ...useGenerationMutation(context),
        ...useBatchMutation(context),
        ...useDocumentMutation(context),
        ...useInterchangeMutations(context),
    };

    const editor = { ...context, ...cleanup, ...mutations };

    const draftActions = useDraftDismissal(editor);

    return { state, queries, jobs, mutations, draftActions };
}
