'use client';
import { useState, type ComponentProps } from 'react';
import { KnowledgeBilingualStudy } from '@/fsd/widgets/knowledge-private-translation';
import { useKnowledgeBlockPlayback } from '@/fsd/widgets/knowledge-speech';
import { KnowledgeVocabularyPractice } from '@/fsd/widgets/knowledge-vocabulary';
import { ContextualAssistant } from '@/fsd/widgets/contextual-assistant';
import type {
    KnowledgeNote,
    LearningBlock,
    WorkbookLearningShareAccess,
} from '@languon/contracts';
import { knowledgeCategoryKeys } from '@/fsd/entities/knowledge';
import { Badge, type MenuItem } from '@/fsd/shared/ui';
import { useSessionStore } from '@/fsd/entities/session';
import { useAuth } from '@/fsd/features/auth';
import { KnowledgeDocumentView } from '@/fsd/features/knowledge-notes';
import {
    LearningProgress,
    useWorkbookLearning,
} from '@/fsd/features/workbook-learning';
import { useI18n } from '@/fsd/shared/i18n';

export function LearningNote({
    note,
    access,
}: {
    note: KnowledgeNote;
    access?: WorkbookLearningShareAccess | undefined;
}) {
    const actorId = useSessionStore((state) => state.user?.id);
    const identity = `${actorId}:${note.id}:${note.version}:${access?.kind}:${access?.locator}:${access?.key}`;
    return (
        <LearningNoteContent
            key={identity}
            note={note}
            access={access}
            actorId={actorId}
        />
    );
}
function LearningNoteContent({
    note,
    access,
    actorId,
}: {
    note: KnowledgeNote;
    access: WorkbookLearningShareAccess | undefined;
    actorId: string | undefined;
}) {
    const { requestWithSession } = useAuth();
    const { locale, t } = useI18n();
    const [request, setRequest] = useState<{ id: string; prompt: string }>();
    const source = {
        kind: 'knowledge' as const,
        id: note.id,
        view: 'saved' as const,
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
        ComponentProps<typeof KnowledgeDocumentView>['wrapBlock']
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
            {note.summary && <p dir='auto'>{note.summary}</p>}
            {note.categories.length > 0 && (
                <div>
                    {note.categories.map((category) => (
                        <Badge key={category}>
                            {t(knowledgeCategoryKeys[category])}
                        </Badge>
                    ))}
                </div>
            )}
            {(note.studiedLanguage || note.explanationLanguage) && (
                <dl>
                    {note.studiedLanguage && (
                        <>
                            <dt>{t('knowledge.studiedLanguage')}</dt>
                            <dd>{note.studiedLanguage}</dd>
                        </>
                    )}
                    {note.explanationLanguage && (
                        <>
                            <dt>{t('knowledge.explanationLanguage')}</dt>
                            <dd>{note.explanationLanguage}</dd>
                        </>
                    )}
                </dl>
            )}
            {actorId && (
                <ContextualAssistant
                    source={source}
                    shareKey={access?.key}
                    contextLabel={note.title}
                    request={request}
                />
            )}
            <LearningProgress model={model} />
            <KnowledgeDocumentView
                body={note.body}
                blockOptions={blockOptions}
                wrapBlock={wrapBlock}
                renderBlockMenu={renderBlockMenu}
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
