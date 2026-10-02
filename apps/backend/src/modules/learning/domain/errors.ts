export class LearningUnavailableError extends Error {}
export class LearningEntryUnavailableError extends Error {}
export class LearningAuthenticationRequiredError extends Error {}
export class LearningConflictError extends Error {
    public constructor(
        public readonly reason:
            | 'preferences_conflict'
            | 'stale_content'
            | 'operation_conflict'
            | 'undo_conflict',
    ) {
        super(reason);
    }
}
export class LearningInvalidRequestError extends Error {}
