import { expect, it } from 'vitest';
import { createValidatedInterviewAccounting } from './validated-interview-accounting';
import { tutorAccountingFixture } from '../../../conversations/infrastructure/ai/tutor-test-fixtures';

it('retains measured Stop usage while refusing completed-result fallback eligibility', async () => {
    const accounting = tutorAccountingFixture();
    const validation = createValidatedInterviewAccounting(accounting);
    const call = {
        callId: 'call',
        purpose: 'answer' as const,
        inputTokenEstimate: 20,
        maxOutputTokens: 100,
        providerCompleted: true,
    };
    const usage = { inputTokens: 20, outputTokens: 10 };
    await validation.port.settle(call, usage);
    expect(accounting.settle).not.toHaveBeenCalled();
    expect(await validation.reject('aborted')).toBe(false);
    expect(accounting.fail).toHaveBeenCalledExactlyOnceWith(
        call,
        'aborted',
        usage,
    );
    await validation.approve();
    expect(accounting.settle).not.toHaveBeenCalled();
});
it('never treats an unknown provider finish as positive completion evidence', async () => {
    const accounting = tutorAccountingFixture();
    const validation = createValidatedInterviewAccounting(accounting);
    const call = {
        callId: 'call',
        purpose: 'answer' as const,
        inputTokenEstimate: 20,
        maxOutputTokens: 100,
        providerCompleted: false,
    };
    await validation.port.settle(call, { inputTokens: 20, outputTokens: 10 });
    expect(await validation.reject()).toBe(false);
    expect(accounting.fail).toHaveBeenCalledOnce();
    expect(accounting.settle).not.toHaveBeenCalled();
});
