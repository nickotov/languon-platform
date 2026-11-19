import type { ConversationSessionRequest } from '@/fsd/entities/conversation';
import type { LessonRunAction } from '../types';
import { lessonRunsApi } from './lesson-runs-api';

export function dispatchLessonAction(
    request: ConversationSessionRequest,
    action: LessonRunAction,
    requestId: string,
    confirmedQuoteId?: string,
) {
    const run = action.run;
    const common = {
        requestId,
        expectedRevision: run.revision,
    };
    const args = [request, run.conversationId, run.id] as const;
    switch (action.kind) {
        case 'continue':
            return lessonRunsApi.continue(...args, {
                ...common,
                ...(action.acknowledgedUncertainTurnId
                    ? {
                          acknowledgedUncertainTurnId:
                              action.acknowledgedUncertainTurnId,
                      }
                    : {}),
                ...(confirmedQuoteId ? { confirmedQuoteId } : {}),
            });
        case 'revise':
            return lessonRunsApi.revise(...args, {
                ...common,
                instruction: action.instruction,
                ...(action.acknowledgedUncertainTurnId
                    ? {
                          acknowledgedUncertainTurnId:
                              action.acknowledgedUncertainTurnId,
                      }
                    : {}),
                ...(confirmedQuoteId ? { confirmedQuoteId } : {}),
            });
        case 'applyRevision':
            return lessonRunsApi.applyRevision(...args, {
                ...common,
                candidateId: action.candidateId,
            });
        case 'resolveSource':
            return lessonRunsApi.resolveSource(...args, {
                ...common,
                choice: action.choice,
                ...(action.sourceId && action.editorContext
                    ? {
                          sourceId: action.sourceId,
                          editorContext: action.editorContext,
                      }
                    : {}),
            });
        case 'discard':
            return lessonRunsApi.discard(...args, common);
        case 'stop':
            return lessonRunsApi.stop(...args, common);
    }
}
