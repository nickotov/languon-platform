export class WorkbookLearningError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'WorkbookLearningError';
    }
}
