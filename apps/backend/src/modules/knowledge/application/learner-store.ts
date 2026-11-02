import type {
    SubmitWorkbookAttemptRequest,
    RecordWorkbookLearningEventRequest,
    SetWorkbookNoteCompletionRequest,
    WorkbookLearnerAttempt,
    WorkbookLearningEvent,
    WorkbookNoteCompletion,
    WorkbookLearningShareAccess,
    WorkbookLearningState,
    WorkbookProgress,
} from '@languon/contracts';

export type LearnerSourceAccess = WorkbookLearningShareAccess;
export type LearnerNoteState = WorkbookLearningState;
export interface LearnerStore {
    workbookProgress(
        actorId: string,
        workbookId: string,
        access?: LearnerSourceAccess,
    ): Promise<WorkbookProgress>;
    read(
        actorId: string,
        noteId: string,
        access?: LearnerSourceAccess,
    ): Promise<LearnerNoteState>;
    attempt(
        actorId: string,
        noteId: string,
        input: SubmitWorkbookAttemptRequest,
        access?: LearnerSourceAccess,
    ): Promise<WorkbookLearnerAttempt>;
    event(
        actorId: string,
        noteId: string,
        input: RecordWorkbookLearningEventRequest,
        access?: LearnerSourceAccess,
    ): Promise<WorkbookLearningEvent>;
    complete(
        actorId: string,
        noteId: string,
        input: SetWorkbookNoteCompletionRequest,
        access?: LearnerSourceAccess,
    ): Promise<WorkbookNoteCompletion | null>;
}
