import { describe, expect, it } from 'vitest';
import { createLearnerInterviewerRunner } from './learner-interviewer';
import {
    scriptedTutorModel,
    tutorAccountingFixture,
} from '../../../conversations/infrastructure/ai/tutor-test-fixtures';
import type { ClaimedInterviewOperation } from '../../application/ports/interview-store';
const operation: ClaimedInterviewOperation = {
    id: 'id',
    interviewId: 'interview',
    ownerId: 'owner',
    generation: 0,
    version: 0,
    state: 'running',
    input: { kind: 'chat', topic: 'goals', text: 'I want to travel' },
    context: {
        locale: 'en',
        approvedItems: null,
        draftItems: null,
        messages: [],
        completedTopics: ['languages'],
    },
    execution: {},
    result: null,
    errorCode: null,
    leaseToken: 'lease',
};
const result = {
    message: 'Which situations matter most?',
    topic: 'goals',
    options: [{ id: 'travel', label: 'Travel' }],
    multiSelect: true,
    answerSummary: 'Travel comfortably',
};
describe('learner interviewer runner', () => {
    it('registers an operation-only tool-free agent, validates output and accounts the provider request', async () => {
        const provider = scriptedTutorModel([JSON.stringify(result)]);
        const accounting = tutorAccountingFixture();
        const runner = createLearnerInterviewerRunner({
            model: provider.model,
            accounting,
            maxInputTokens: 64000,
        });
        expect(
            await runner.run({
                operation,
                signal: new AbortController().signal,
            }),
        ).toEqual(result);
        expect(accounting.admit).toHaveBeenCalledOnce();
        expect(accounting.settle).toHaveBeenCalledOnce();
        expect(provider.requests).toHaveLength(1);
        const request = JSON.stringify(provider.requests[0]);
        expect(request).toContain('explanation-languages');
        expect(request).toContain('never claim access');
        expect(provider.requests[0]?.tools ?? []).toHaveLength(0);
    });
    it('rejects over-limit answer proposals without repair or a second paid call', async () => {
        const provider = scriptedTutorModel([
            JSON.stringify({ ...result, answerSummary: 'a'.repeat(201) }),
        ]);
        const runner = createLearnerInterviewerRunner({
            model: provider.model,
            accounting: tutorAccountingFixture(),
            maxInputTokens: 64000,
        });
        await expect(
            runner.run({ operation, signal: new AbortController().signal }),
        ).rejects.toThrow();
        expect(provider.requests).toHaveLength(1);
    });
    it('rejects an external redirect and invented output fields', async () => {
        const provider = scriptedTutorModel([
            JSON.stringify({
                ...result,
                redirect: 'https://example.com',
                useEnabled: true,
            }),
        ]);
        const runner = createLearnerInterviewerRunner({
            model: provider.model,
            accounting: tutorAccountingFixture(),
            maxInputTokens: 64000,
        });
        await expect(
            runner.run({ operation, signal: new AbortController().signal }),
        ).rejects.toThrow();
    });
    it('rejects diagnostic labels in reusable proposed items', async () => {
        const provider = scriptedTutorModel([
            JSON.stringify({
                ...result,
                proposedItems: {
                    languages: [],
                    explanationLanguages: [],
                    goals: [],
                    accommodations: ['ADHD'],
                    hobbies: [],
                },
            }),
        ]);
        const runner = createLearnerInterviewerRunner({
            model: provider.model,
            accounting: tutorAccountingFixture(),
            maxInputTokens: 64000,
        });
        await expect(
            runner.run({ operation, signal: new AbortController().signal }),
        ).rejects.toThrow();
        expect(provider.requests).toHaveLength(1);
    });
    it('does not dispatch when accounting admission fails', async () => {
        const provider = scriptedTutorModel([JSON.stringify(result)]);
        const accounting = tutorAccountingFixture();
        accounting.admit.mockRejectedValue(new Error('credits_exhausted'));
        const runner = createLearnerInterviewerRunner({
            model: provider.model,
            accounting,
            maxInputTokens: 64000,
        });
        await expect(
            runner.run({ operation, signal: new AbortController().signal }),
        ).rejects.toThrow();
        expect(provider.requests).toHaveLength(0);
    });
});
