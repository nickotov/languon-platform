'use client';
import { MessageSquarePlus } from 'lucide-react';
import {
    knowledgeBlockReferences,
    knowledgeBlockMentionIds,
} from '@/fsd/features/knowledge-notes';
import { useState, type ComponentProps } from 'react';
import { useKnowledgeBlockPlayback } from '@/fsd/widgets/knowledge-speech';
import { KnowledgeBilingualStudy } from '@/fsd/widgets/knowledge-private-translation';
import { KnowledgeVocabularyPractice } from '@/fsd/widgets/knowledge-vocabulary';
import { ContextualAssistant } from '@/fsd/widgets/contextual-assistant';
import type {
    KnowledgeNote,
    LearningBlock,
    WorkbookLearningShareAccess,
} from '@languon/contracts';
import { useSessionStore } from '@/fsd/entities/session';
import { useAuth } from '@/fsd/features/auth';
import { NotePreview } from '../knowledge-detail-page/note-preview';
import {
    LearningProgress,
    useWorkbookLearning,
} from '@/fsd/features/workbook-learning';
import type { MenuItem } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';

export function SharedNoteLearning({
    note,
    access,
}: {
    note: KnowledgeNote;
    access: WorkbookLearningShareAccess;
}) {
    const actorId = useSessionStore((state) => state.user?.id);
    const identity = `${actorId}:${note.id}:${note.version}:${access.locator}:${access.key}`;
    return (
        <Content key={identity} note={note} access={access} actorId={actorId} />
    );
}
function Content({
    note,
    access,
    actorId,
}: {
    note: KnowledgeNote;
    access: WorkbookLearningShareAccess;
    actorId: string | undefined;
}) {
    const { requestWithSession } = useAuth();
    const { locale, t } = useI18n();
    const [request, setRequest] = useState<{
        id: string;
        prompt?: string;
        blockIds?: string[];
    }>();
    const source = {
        kind: 'knowledge' as const,
        id: note.id,
        ...(access
            ? {
                  shareLocator: access.locator,
                  shareKind:
                      access.kind === 'note'
                          ? ('knowledge' as const)
                          : ('workbook' as const),
              }
            : {}),
    };
    const playback = useKnowledgeBlockPlayback({
        noteId: note.id,
        requestWithSession,
    });
    const blocks =
        note.body.document.content?.flatMap((node) =>
            node.attrs?.block ? [node.attrs.block] : [],
        ) ?? [];
    const blockPlayback = actorId
        ? playback.options(async () => ({
              origin: {
                  kind: 'saved',
                  expectedNoteVersion: note.version,
                  access,
              },
              blocks,
          }))
        : undefined;
    const model = useWorkbookLearning({
        noteId: note.id,
        noteVersion: note.version,
        body: note.body,
        actorId,
        locale,
        requestWithSession,
        access,
        onAiRequest: setRequest,
    });
    const library = actorId
        ? {
              requestWithSession,
              noteId: note.id,
              noteVersion: note.version,
              access,
          }
        : undefined;
    function blockOptions(block: LearningBlock) {
        return {
            ...model.options(block),
            variant: 'learner' as const,
            playback: blockPlayback,
        };
    }
    const wrapBlock: NonNullable<
        ComponentProps<typeof NotePreview>['wrapBlock']
    > = (block, render) => {
        if (!actorId || block.type !== 'bilingual-text') return render();
        return (
            <KnowledgeBilingualStudy
                actorId={actorId}
                noteId={note.id}
                noteVersion={note.version}
                block={block}
                requestWithSession={requestWithSession}
                access={access}
                viewOptions={blockOptions(block)}
                library={library}
            >
                {render}
            </KnowledgeBilingualStudy>
        );
    };
    function getBlockActions(block: LearningBlock): MenuItem[] {
        if (!actorId) return [];
        return [
            {
                label: t('knowledge.addBlockToChat'),
                icon: <MessageSquarePlus size={16} aria-hidden />,
                onSelect() {
                    setRequest({
                        id: crypto.randomUUID(),
                        blockIds: knowledgeBlockMentionIds(
                            note.body.document,
                            block.id,
                        ),
                    });
                },
            },
        ];
    }
    function renderBlockMenu(block: LearningBlock, items: MenuItem[]) {
        if (!actorId || block.type !== 'vocabulary') return null;
        return (
            <KnowledgeVocabularyPractice
                noteId={note.id}
                block={block}
                actorId={actorId}
                requestWithSession={requestWithSession}
                access={access}
                blockMenu
                commonMenuItems={items}
            />
        );
    }
    return (
        <>
            {playback.confirmation}
            {actorId && (
                <ContextualAssistant
                    source={source}
                    shareKey={access?.key}
                    contextLabel={note.title}
                    blocks={knowledgeBlockReferences(note.body.document)}
                    request={request}
                />
            )}
            <LearningProgress model={model} />
            <NotePreview
                content={note}
                renderBlockMenu={renderBlockMenu}
                getBlockActions={getBlockActions}
                blockOptions={blockOptions}
                wrapBlock={wrapBlock}
                library={library}
                blockCopy={
                    actorId
                        ? {
                              requestWithSession,
                              source: {
                                  kind: 'saved',
                                  noteId: note.id,
                                  expectedVersion: note.version,
                                  ...(access ? { access } : {}),
                              },
                          }
                        : undefined
                }
            />
        </>
    );
}
