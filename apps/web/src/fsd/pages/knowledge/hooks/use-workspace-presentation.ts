import { knowledgeBlockMentionIds } from '@/fsd/features/knowledge-notes';
import { useEffect, useState } from 'react';
import { useI18n } from '@/fsd/shared/i18n';
import { knowledgePlainText } from '../lib/workspace-document';
import { hasUnpublishedKnowledgeChanges } from '../lib/unpublished-knowledge-changes';
import type { useKnowledgePageActions } from './use-knowledge-page-actions';

type TutorRequest = {
    id: string;
    passage?: string;
    prompt?: string;
    targetId?: string;
    autoSend?: boolean;
    blockIds?: string[];
    exercisePicker?: boolean;
};

/** Local presentation state; publication and recovery remain in page actions. */
export function useWorkspacePresentation(
    actions: ReturnType<typeof useKnowledgePageActions>,
) {
    const { t } = useI18n();
    const [request, setRequest] = useState<TutorRequest>();
    const [titleVisible, setTitleVisible] = useState(true);
    const [tutorBusy, setTutorBusy] = useState(false);
    const content = actions.draft?.content;
    const published = actions.workspace?.published;
    const text = content ? knowledgePlainText(content.body.document) : '';
    const characters = Array.from(text).length;
    const words = text.trim() ? text.trim().split(/\s+/u).length : 0;
    const dirty = hasUnpublishedKnowledgeChanges(content, published);

    function mentionBlock(blockId: string) {
        setRequest({
            id: crypto.randomUUID(),
            blockIds: actions.draft
                ? knowledgeBlockMentionIds(
                      actions.draft.content.body.document,
                      blockId,
                  )
                : [blockId],
        });
    }

    function generateExercises(blockId: string) {
        setRequest({
            id: crypto.randomUUID(),
            blockIds: [blockId],
            exercisePicker: true,
        });
    }

    function askTutor(passage: string) {
        const snapshot = actions.getSnapshot();
        setRequest({
            id: crypto.randomUUID(),
            passage,
            ...(snapshot.targetId ? { targetId: snapshot.targetId } : {}),
        });
    }

    function tutorAction(
        action:
            | 'explain'
            | 'correct'
            | 'translate'
            | 'simplify'
            | 'rephrase'
            | 'examples',
        passage: string,
    ) {
        const snapshot = actions.getSnapshot();
        setRequest({
            id: crypto.randomUUID(),
            autoSend: true,
            passage,
            prompt: t(`knowledge.actionPrompt.${action}`),
            ...(snapshot.targetId ? { targetId: snapshot.targetId } : {}),
        });
    }

    function askOutline() {
        setRequest({
            id: crypto.randomUUID(),
            autoSend: true,
            prompt: t('knowledge.outlinePrompt'),
        });
    }

    function preview(targetId?: string) {
        return actions.editor.current?.getProposalPreview(targetId) ?? null;
    }

    function showTarget(targetId?: string) {
        if (targetId) {
            actions.editor.current?.showTarget(targetId);
        }
    }

    const { canPublish, busy, save } = actions;
    useEffect(() => {
        function shortcut(event: KeyboardEvent) {
            if (
                (event.metaKey || event.ctrlKey) &&
                event.key.toLowerCase() === 's'
            ) {
                event.preventDefault();
                if (canPublish && dirty && busy === null) {
                    void save();
                }
            }
        }

        window.addEventListener('keydown', shortcut);

        return () => window.removeEventListener('keydown', shortcut);
    }, [canPublish, dirty, busy, save]);

    return {
        request,
        dirty,
        characters,
        words,
        tutorBusy,
        setTutorBusy,
        titleVisible,
        setTitleVisible,
        tutorAction,
        mentionBlock,
        generateExercises,
        askTutor,
        askOutline,
        preview,
        showTarget,
        proposalPosition: (targetId?: string) =>
            (targetId
                ? actions.editor.current?.getProposalPosition(targetId)
                : null) ?? null,
    };
}
