/** Vitest's JSON reporter omits retries; retain them so a recovered failure cannot pass the gate. */
export default class BackendRetryReporter {
    onTestCaseResult(testCase) {
        testCase.task.meta.criticalRetryCount =
            testCase.task.result?.retryCount ?? 0;
        testCase.task.meta.criticalExpectedFailure =
            testCase.task.fails === true;
        testCase.task.meta.criticalRepeatCount =
            testCase.task.result?.repeatCount ?? 0;
    }
}
