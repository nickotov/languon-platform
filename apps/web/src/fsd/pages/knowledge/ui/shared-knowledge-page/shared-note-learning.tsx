'use client';
import { useState } from 'react';
import { KnowledgePrivateTranslation } from '@/fsd/widgets/knowledge-private-translation';
import { KnowledgeVocabularyPractice } from '@/fsd/widgets/knowledge-vocabulary';
import { ContextualAssistant } from '@/fsd/widgets/contextual-assistant';
import type {
    KnowledgeNote,
    WorkbookLearningShareAccess,
} from '@languon/contracts';
import { useSessionStore } from '@/fsd/entities/session';
import { useAuth } from '@/fsd/features/auth';
import { NotePreview } from '../knowledge-detail-page/note-preview';
import {
    LearningProgress,
    useWorkbookLearning,
} from '@/fsd/features/workbook-learning';
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
    const { locale } = useI18n();
    const [request, setRequest] = useState<{ id: string; prompt: string }>();
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
    return (
        <>
            {actorId && (
                <ContextualAssistant
                    source={source}
                    shareKey={access?.key}
                    contextLabel={note.title}
                    request={request}
                />
            )}
            <LearningProgress model={model} />
            <NotePreview
                content={note}
                blockOptions={(block) => ({
                    ...model.options(block),
                    ...(block.type === 'bilingual-text' && actorId
                        ? {
                              actions: (
                                  <KnowledgePrivateTranslation
                                      actorId={actorId}
                                      noteId={note.id}
                                      noteVersion={note.version}
                                      block={block}
                                      requestWithSession={requestWithSession}
                                      access={access}
                                  />
                              ),
                          }
                        : {}),
                    ...(block.type === 'vocabulary' && actorId
                        ? {
                              actions: (
                                  <KnowledgeVocabularyPractice
                                      noteId={note.id}
                                      block={block}
                                      actorId={actorId}
                                      requestWithSession={requestWithSession}
                                      access={access}
                                  />
                              ),
                          }
                        : {}),
                })}
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
