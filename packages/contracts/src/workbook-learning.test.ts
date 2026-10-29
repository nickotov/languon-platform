import { describe, expect, it } from 'vitest';
import {
    SubmitWorkbookAttemptRequestSchema,
    RecordWorkbookLearningEventRequestSchema,
    WorkbookLearnerAttemptSchema,
    SetWorkbookNoteCompletionRequestSchema,
    WorkbookLearningShareAccessSchema,
    WorkbookLearningStateSchema,
    WorkbookProgressSchema,
} from './workbook-learning';
const id = '00000000-0000-4000-8000-000000000001';
const revision = 'a'.repeat(64);
const request = {
    id,
    noteVersion: 1,
    exerciseId: id,
    exerciseRevision: revision,
    answer: { format: 'free-text', text: 'My response' },
};

describe('private workbook learning contracts', () => {
    it('validates share credentials as syntax without accepting arbitrary header fields', () => {
        expect(
            WorkbookLearningShareAccessSchema.safeParse({
                kind: 'workbook',
                locator: 'a'.repeat(32),
                key: 'b'.repeat(43),
            }).success,
        ).toBe(true);
        expect(
            WorkbookLearningShareAccessSchema.safeParse({
                kind: 'workbook',
                locator: 'bad',
                key: 'b'.repeat(43),
            }).success,
        ).toBe(false);
        expect(
            WorkbookLearningShareAccessSchema.safeParse({
                kind: 'owner',
                locator: 'a'.repeat(32),
                key: 'b'.repeat(43),
            }).success,
        ).toBe(false);
    });
    it('requires explicit bounded-state truncation rather than implying exhaustive history', () => {
        const state = {
            noteId: id,
            noteVersion: 1,
            attempts: [],
            events: [],
            completion: null,
            updatedSinceCompletion: false,
            exerciseRevisions: [],
            truncated: false,
        };
        expect(WorkbookLearningStateSchema.parse(state)).toEqual(state);
        expect(
            WorkbookLearningStateSchema.safeParse({
                ...state,
                truncated: undefined,
            }).success,
        ).toBe(false);
    });
    it('accepts bounded versioned responses without client correctness', () => {
        expect(SubmitWorkbookAttemptRequestSchema.parse(request)).toEqual(
            request,
        );
        expect(
            SubmitWorkbookAttemptRequestSchema.safeParse({
                ...request,
                correct: true,
            }).success,
        ).toBe(false);
        expect(
            SubmitWorkbookAttemptRequestSchema.safeParse({
                ...request,
                actorId: id,
            }).success,
        ).toBe(false);
    });
    it('rejects invalid versions and answer formats', () => {
        expect(
            SubmitWorkbookAttemptRequestSchema.safeParse({
                ...request,
                noteVersion: 0,
            }).success,
        ).toBe(false);
        expect(
            SubmitWorkbookAttemptRequestSchema.safeParse({
                ...request,
                exerciseRevision: 'latest',
            }).success,
        ).toBe(false);
        expect(
            SubmitWorkbookAttemptRequestSchema.safeParse({
                ...request,
                answer: { format: 'free-text', text: 'x'.repeat(8001) },
            }).success,
        ).toBe(false);
    });
    it('rejects duplicate and oversized gap responses', () => {
        expect(
            SubmitWorkbookAttemptRequestSchema.safeParse({
                ...request,
                answer: {
                    format: 'fill-in-the-blank',
                    gaps: [
                        { id, answer: 'a' },
                        { id, answer: 'b' },
                    ],
                },
            }).success,
        ).toBe(false);
        const gaps = Array.from({ length: 5 }, (_, index) => ({
            id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
            answer: 'x'.repeat(8000),
        }));
        expect(
            SubmitWorkbookAttemptRequestSchema.safeParse({
                ...request,
                answer: { format: 'fill-in-the-blank', gaps },
            }).success,
        ).toBe(false);
    });
    it('keeps hint/reveal events versioned and distinct from correctness', () => {
        const event = {
            id,
            noteVersion: 1,
            blockId: id,
            kind: 'hint-used',
            exerciseRevision: revision,
        };
        expect(RecordWorkbookLearningEventRequestSchema.parse(event)).toEqual(
            event,
        );
        expect(
            RecordWorkbookLearningEventRequestSchema.safeParse({
                ...event,
                exerciseRevision: undefined,
            }).success,
        ).toBe(false);
        expect(
            RecordWorkbookLearningEventRequestSchema.safeParse({
                ...event,
                correct: true,
            }).success,
        ).toBe(false);
    });
    it('requires server evaluation to carry a method only when checked', () => {
        const attempt = {
            ...request,
            noteId: id,
            createdAt: '2026-10-28T12:00:00Z',
            evaluation: { status: 'unchecked' },
        };
        expect(WorkbookLearnerAttemptSchema.parse(attempt)).toEqual(attempt);
        expect(
            WorkbookLearnerAttemptSchema.safeParse({
                ...attempt,
                evaluation: { status: 'correct' },
            }).success,
        ).toBe(false);
    });
    it('represents explicit completion and reopening without a score', () => {
        expect(
            SetWorkbookNoteCompletionRequestSchema.safeParse({
                id,
                noteVersion: 2,
                completed: true,
            }).success,
        ).toBe(true);
        expect(
            SetWorkbookNoteCompletionRequestSchema.safeParse({
                id,
                noteVersion: 2,
                completed: false,
            }).success,
        ).toBe(true);
        expect(
            SetWorkbookNoteCompletionRequestSchema.safeParse({
                id,
                noteVersion: 2,
                completed: true,
                score: 10,
            }).success,
        ).toBe(false);
    });
});

it('bounds aggregate completion counts without introducing scores or learner identities', () => {
    const progress = {
        workbookId: id,
        workbookVersion: 1,
        totalNotes: 2,
        completedNotes: 1,
        updatedSinceCompletion: 1,
    };
    expect(WorkbookProgressSchema.safeParse(progress).success).toBe(true);
    expect(
        WorkbookProgressSchema.safeParse({ ...progress, completedNotes: 3 })
            .success,
    ).toBe(false);
    expect(
        WorkbookProgressSchema.safeParse({
            ...progress,
            updatedSinceCompletion: 2,
        }).success,
    ).toBe(false);
    expect(
        WorkbookProgressSchema.safeParse({ ...progress, actorId: id }).success,
    ).toBe(false);
});
