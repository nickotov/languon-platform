import type {
    TutorAccountingPort,
    TutorCallAdmission,
    TutorCallUsage,
} from '../../../conversations/application/ports/tutor-runner';

/** Provider completion is not portrait success. Keep the attempt dispatched
 * during bounded local validation; settlement remains under the normal fences. */
export function createValidatedInterviewAccounting(
    accounting: TutorAccountingPort,
) {
    let pending: Array<{ call: TutorCallAdmission; usage: TutorCallUsage }> =
        [];
    function take() {
        const calls = pending;
        pending = [];
        return calls;
    }
    const port: TutorAccountingPort = {
        admit: (call) => accounting.admit(call),
        settle: async (call, usage) => {
            pending.push({ call: { ...call }, usage: { ...usage } });
        },
        fail: (call, reason, usage) => accounting.fail(call, reason, usage),
    };
    return {
        port,
        async approve() {
            for (const { call, usage } of take())
                await accounting.settle(call, usage);
        },
        async reject(reason: 'provider-error' | 'aborted' = 'provider-error') {
            const calls = take();
            const completed =
                calls.length > 0 &&
                calls.every(({ call }) => call.providerCompleted === true);
            for (const { call, usage } of calls)
                await accounting.fail(call, reason, usage);
            return completed && reason === 'provider-error';
        },
    };
}
