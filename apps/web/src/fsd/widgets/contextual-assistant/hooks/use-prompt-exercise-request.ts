import { useEffect, useRef } from 'react';
import type { Editor, JSONContent } from '@tiptap/core';
import {
    getExerciseActivity,
    type SubmitConversationTurnRequest,
} from '@languon/contracts';
import type { Locale } from '@/fsd/shared/i18n';
import type { KnowledgeBlockReference } from '@/fsd/features/knowledge-notes';
import { replacePromptSelection } from '../lib/prompt-selection';
import { serializePrompt } from '../lib/prompt-document';

/** Applying advanced choices owns the shared activity/source selection, not prose. */
export function usePromptExerciseRequest(
    editor: Editor | null,
    request: SubmitConversationTurnRequest['exerciseRequest'],
    locale: Locale,
    sources: KnowledgeBlockReference[],
) {
    const previous = useRef<{
        editor: Editor;
        request: SubmitConversationTurnRequest['exerciseRequest'];
        sourceIds: string[];
    } | null>(null);

    useEffect(() => {
        if (!editor) {
            return;
        }

        const old = previous.current;
        if (old?.editor === editor && old.request === request) {
            return;
        }

        previous.current = {
            editor,
            request,
            sourceIds: sources.map((source) => source.id),
        };

        if (request) {
            const nodes: JSONContent[] = [];
            for (const activity of request.activities ?? []) {
                nodes.push(
                    { type: 'text', text: ' ' },
                    {
                        type: 'promptMention',
                        attrs: {
                            kind: 'exercise',
                            activityId: activity.activityId,
                            catalogVersion: 1,
                            label: getExerciseActivity(activity.activityId)
                                .locales[locale].name,
                            selectionOwner: 'advanced',
                        },
                    },
                );
            }

            for (const source of sources) {
                nodes.push(
                    { type: 'text', text: ' ' },
                    {
                        type: 'promptMention',
                        attrs: {
                            kind: 'block',
                            blockId: source.id,
                            label: source.title,
                            selectionOwner: 'advanced',
                        },
                    },
                );
            }

            replacePromptSelection(editor, nodes, () => true);
        } else if (old?.editor === editor && old.request) {
            const mentions = serializePrompt(editor.getJSON()).promptMentions;
            const types = mentions.flatMap((item) =>
                item.kind === 'exercise' ? [item.activityId] : [],
            );
            const blocks = mentions.flatMap((item) =>
                item.kind === 'block' ? [item.blockId] : [],
            );
            const edited =
                JSON.stringify(types) !==
                    JSON.stringify(
                        old.request.activities?.map(
                            (item) => item.activityId,
                        ) ?? [],
                    ) ||
                JSON.stringify(blocks) !== JSON.stringify(old.sourceIds);

            if (edited) {
                const transaction = editor.state.tr.setMeta('promptSync', true);
                editor.state.doc.descendants((node, position) => {
                    if (
                        node.type.name === 'promptMention' &&
                        node.attrs.selectionOwner === 'advanced'
                    ) {
                        transaction.setNodeMarkup(position, undefined, {
                            ...node.attrs,
                            selectionOwner: null,
                        });
                    }
                });

                if (transaction.docChanged) {
                    editor.view.dispatch(transaction);
                }
            } else {
                replacePromptSelection(
                    editor,
                    [],
                    (attrs) => attrs.selectionOwner === 'advanced',
                );
            }
        }
    }, [editor, request, locale, sources]);
}
