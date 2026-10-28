import { resolve } from 'node:path';

export const backendExecutionFiles = Object.freeze([
    'tests/integration/database/native-provider-pricing.test.ts',
    'tests/integration/database/native-financial-admission.test.ts',
    'tests/integration/database/ai-accounting.test.ts',
    'tests/unit/modules/ai-credits/interface/provider-prices.routes.test.ts',
    'tests/integration/database/native-call-monetary-authority.test.ts',
    'tests/integration/modules/speech/native-speech-accounting.test.ts',
    'tests/integration/modules/text-ai/native-text-pricing-execution.test.ts',
    'tests/integration/modules/text-ai/native-probe-pricing.test.ts',
    'tests/unit/modules/speech/native-speech-provider-observation.test.ts',
    'tests/unit/modules/text-ai/infrastructure/native-provider-observations.test.ts',
    'tests/unit/modules/admin-mcp/native-price-verification.test.ts',
    'tests/unit/modules/ai-credits/infrastructure/native-text-expense.test.ts',
    'tests/unit/modules/dictionaries/infrastructure/generation-completion-usage.test.ts',
    'src/modules/ai-credits/domain/native-provider-pricing.test.ts',
    'src/modules/ai-credits/infrastructure/pricing/provider-price-sources.test.ts',
    'tests/integration/database/model-price-actualization.journeys.test.ts',
    'tests/integration/modules/learning/infrastructure/drizzle-sentence-stores.test.ts',
    'tests/integration/modules/texts/text-selection.test.ts',
    'tests/integration/modules/dictionaries/infrastructure/dictionary-batch-provider-admission.test.ts',
    'tests/unit/infrastructure/worker/sentence-worker-runtime.test.ts',
    'tests/integration/modules/text-ai/text-ai-probes.test.ts',
    'tests/integration/modules/text-ai/text-ai-routing.test.ts',
    'tests/unit/modules/text-ai/infrastructure/gateway-provider-adapters.test.ts',
    'tests/unit/infrastructure/probe-flow-registry.test.ts',
    'tests/unit/modules/text-ai/text-ai-probe-service.test.ts',
    'tests/unit/modules/text-ai/text-ai-probe-executor.test.ts',
    'tests/unit/modules/administration/interface/http/admin-text-ai-probe.routes.test.ts',
    'tests/unit/config/text-ai-probe-environment.test.ts',
    'tests/unit/modules/text-ai/infrastructure/dictionary-router-gateway-runtime.test.ts',
    'tests/unit/modules/text-ai/infrastructure/provider-runtime-observer.test.ts',
    'tests/integration/database/provider-minimum-cost.test.ts',
    'tests/integration/modules/conversations/conversation-accounting.test.ts',
    'tests/integration/database/dictionary-worker-accounting-role.test.ts',
    'src/modules/conversations/infrastructure/ai/contextual-tutor-runner.test.ts',
    'src/modules/conversations/infrastructure/ai/accounted-tutor-model.test.ts',
    'src/modules/learner-portraits/infrastructure/ai/learner-interviewer.test.ts',
    'src/modules/learner-portraits/infrastructure/ai/validated-interview-accounting.test.ts',
    'tests/unit/modules/text-ai/run-pinned-fallback.test.ts',
    'tests/integration/modules/dictionaries/infrastructure/dictionary-card-authoring-generation-store.test.ts',
    'tests/integration/modules/speech/openrouter-speech-execution.test.ts',
    'tests/unit/modules/speech/openrouter-speech-provider.test.ts',
    'tests/unit/modules/speech/openrouter-speech-configuration.test.ts',
    'tests/unit/modules/dictionaries/infrastructure/audio-adapters.test.ts',
    'tests/integration/modules/speech/speech-accounting.test.ts',
    'tests/unit/modules/speech/speech-worker.test.ts',
]);

/** Required incident regressions cannot disappear behind an aggregate passing count. */
export const requiredBackendScenarios = Object.freeze([
    {
        file: 'tests/integration/database/native-financial-admission.test.ts',
        titles: [
            'rejects an uncovered later dispatch gap before admitting an attempt or issuing HTTP receipts',
            'admits a covered price transition and pins the complete exclusive action deadline horizon',
            'preserves extreme native credit evidence while settling unrepresentable USD cost as unknown',
            'rejects incompatible native text meters in SQL even when TypeScript admission is bypassed',
        ],
    },
    {
        file: 'tests/integration/modules/text-ai/native-text-pricing-execution.test.ts',
        titles: [
            'retains raw reported cost checkpoint when SDK aggregate token usage is absent',
            'reuses the observed remainder for two sequential SDK calls instead of reserving both full envelopes',
            'rejects missing, foreign and duplicate receipt sets without losing the real checkpoint',
            'preserves an incurred reported-cost overrun and blocks the next SDK dispatch before HTTP',
            ...['deepseek', 'evolink'].flatMap((provider) =>
                ['operator', 'customer'].flatMap((funding) =>
                    ['success', 'failure'].map(
                        (outcome) =>
                            `native '${provider}' '${funding}' '${outcome}' completes the production SDK and financial action path`,
                    ),
                ),
            ),
        ],
    },
    {
        file: 'tests/integration/modules/text-ai/native-probe-pricing.test.ts',
        titles: [
            'records the entire OpenRouter reported-cost overrun through the real SDK while failing the probe',
        ],
    },
    {
        file: 'tests/integration/modules/dictionaries/infrastructure/dictionary-card-authoring-generation-store.test.ts',
        titles: [
            'settles native namespaced card authoring through the production SDK with canonical expense and no flat projection',
            ...['operator', 'customer'].flatMap((funding) =>
                ['success', 'transport failure'].map(
                    (outcome) =>
                        `settles namespaced card authoring through the production SDK: ${funding} / ${outcome}`,
                ),
            ),
            'accepts circuit keys for every catalog model while preserving legacy keys and malformed-key guards',
        ],
    },
    {
        file: 'tests/integration/modules/speech/openrouter-speech-execution.test.ts',
        titles: [
            'completes Free operator-funded French speech through production composition without a customer tariff',
            'completes Paid customer-funded French speech and settles the exact held tariff once',
            'persists ambiguous transport failure with unknown provider expense and releases the Paid learner hold',
            'persists definitive HTTP rejection without charging the Paid learner or inventing provider spend',
            'persists Free operator-funded speech failure without a customer hold or charge',
            'renews the fenced storage lease after slow OpenRouter synthesis and publishes once across the original expiry',
            'rejects a expired storage owner before renewing or publishing',
            'rejects a replaced storage owner before renewing or publishing',
        ],
    },
]);

/** Add future crucial journeys here; every entry runs against fresh owned services. */
export const flows = [
    {
        id: 'setup-to-generation',
        minimumTests: 1,
        app: 'admin',
        file: 'setup-to-generation.journeys.spec.ts',
        grep: '.',
        prerequisite: 'empty-admin-database',
        env: { ADMIN_E2E_SETUP_JOURNEY: 'true' },
    },
    {
        id: 'admin-text-ai-routing',
        minimumTests: 1,
        app: 'admin',
        file: 'text-ai-routing.journeys.spec.ts',
        grep: '.',
        prerequisite: 'empty-admin-database',
        env: { ADMIN_E2E_SYNTHETIC_PROBES: 'true' },
    },
    {
        id: 'authentication',
        minimumTests: 3,
        app: 'web',
        file: 'auth.journeys.spec.ts',
        grep: '.',
        prerequisite: 'deterministic-web',
    },
    {
        id: 'admin-session-refresh',
        minimumTests: 3,
        app: 'admin',
        file: 'admin-user-management.journeys.spec.ts',
        grep: 'owner signs in, refreshes|refreshes expired admin access|expired recent-authentication window',
        prerequisite: 'empty-admin-database',
        env: { ADMIN_E2E_ACCESS_TOKEN_TTL: '60s' },
    },
    {
        id: 'dictionary-generation',
        minimumTests: 1,
        app: 'web',
        file: 'dictionary-platform.journeys.spec.ts',
        grep: 'accounted batch desktop generation survives reload',
        prerequisite: 'deterministic-web',
    },
    {
        id: 'sentence-practice',
        minimumTests: 2,
        app: 'web',
        file: 'sentence-practice.journeys.spec.ts',
        grep: 'checks owner practice and gives a zero-credit reader|unavailable provider model keeps the answer',
        prerequisite: 'deterministic-sentence-services',
        env: { AUTH_E2E_SENTENCE_SERVICES: 'true' },
    },
    {
        id: 'text-generation',
        minimumTests: 2,
        app: 'texts',
        file: 'texts.journeys.spec.ts',
        grep: 'owner translates, saves|independent text keeps',
        prerequisite: 'deterministic-texts',
        dependsOn: ['setup-to-generation'],
    },
    {
        id: 'chat-lifecycle',
        minimumTests: 1,
        app: 'assistant',
        file: 'contextual-assistant.journeys.spec.ts',
        grep: 'closing reconnects without duplicating',
        prerequisite: 'deterministic-assistant',
    },
    {
        id: 'insufficient-credits',
        minimumTests: 1,
        app: 'portrait',
        file: 'learner-portrait.journeys.spec.ts',
        grep: 'zero credits show a focused visible error',
        prerequisite: 'deterministic-portrait-paid-policy',
        env: { LEARNER_PORTRAIT_TEST_PAID: 'true' },
    },
    {
        id: 'free-interview',
        minimumTests: 1,
        app: 'portrait',
        file: 'learner-portrait.journeys.spec.ts',
        grep: 'interview resumes, uses a deterministic',
        prerequisite: 'deterministic-portrait',
    },
    {
        id: 'speech-playback',
        minimumTests: 4,
        app: 'web',
        file: 'shared-pronunciation.journeys.spec.ts',
        grep: '.',
        prerequisite: 'deterministic-speech-services',
        dependsOn: ['ai-execution-contracts'],
    },
    {
        id: 'admin-mcp',
        minimumTests: 3,
        app: 'admin',
        file: 'admin-mcp.journeys.spec.ts',
        grep: '.',
        prerequisite: 'empty-admin-database',
        env: { ADMIN_E2E_MCP: 'true' },
    },
    {
        id: 'ai-execution-contracts',
        minimumTests: 300,
        app: 'backend',
        files: [...backendExecutionFiles],
        prerequisite: 'disposable-backend-production-execution',
    },
];

export function selectFlows(args, registry = flows) {
    if (args[0] === '--') args = args.slice(1);
    validateRegistry(registry);
    const ids = [];
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--list') continue;
        if (
            args[i] !== '--flow' ||
            !args[i + 1] ||
            args[i + 1].startsWith('--')
        )
            throw new Error('Usage: --list or --flow <id> (repeatable)');
        ids.push(args[++i]);
    }
    for (const id of ids)
        if (!registry.some((flow) => flow.id === id))
            throw new Error(`Unknown critical flow: ${id}`);
    const selected = new Set();
    const ordered = [];
    const add = (flow) => {
        if (selected.has(flow.id)) return;
        for (const dependency of flow.dependsOn ?? [])
            add(registry.find((entry) => entry.id === dependency));
        selected.add(flow.id);
        ordered.push(flow);
    };
    for (const flow of registry)
        if (!ids.length || ids.includes(flow.id)) add(flow);
    return ordered;
}

export function validateRegistry(registry = flows) {
    const ids = new Set();
    for (const flow of registry) {
        if (!/^[a-z][a-z0-9-]+$/.test(flow.id) || ids.has(flow.id))
            throw new Error('Invalid or duplicate critical flow id');
        ids.add(flow.id);
        if (
            !(flow.app === 'backend'
                ? flow.id === 'ai-execution-contracts' &&
                  Array.isArray(flow.files) &&
                  flow.files.length === backendExecutionFiles.length &&
                  backendExecutionFiles.every(
                      (file, index) => flow.files[index] === file,
                  ) &&
                  flow.env === undefined &&
                  flow.grep === undefined &&
                  flow.file === undefined &&
                  flow.minimumTests >= 50
                : ['web', 'admin', 'texts', 'assistant', 'portrait'].includes(
                      flow.app,
                  ) &&
                  /^[a-z-]+\.journeys\.spec\.ts$/.test(flow.file) &&
                  Boolean(flow.grep)) ||
            !flow.prerequisite ||
            !Number.isSafeInteger(flow.minimumTests) ||
            flow.minimumTests < 1
        )
            throw new Error(`Incomplete critical flow: ${flow.id}`);
        if (flow.grep) new RegExp(flow.grep);
        validateFeatureFlags(flow.env);
        if (flow.dependsOn !== undefined && !Array.isArray(flow.dependsOn))
            throw new Error(`Invalid dependencies: ${flow.id}`);
    }
    if (!ids.size) throw new Error('Critical flow registry cannot be empty');
    const complete = new Set();
    const visiting = new Set();
    const visit = (flow) => {
        if (visiting.has(flow.id))
            throw new Error(`Cyclic critical flow dependency: ${flow.id}`);
        if (complete.has(flow.id)) return;
        visiting.add(flow.id);
        for (const id of flow.dependsOn ?? []) {
            const dependency = registry.find((entry) => entry.id === id);
            if (!dependency)
                throw new Error(`Unknown critical flow dependency: ${id}`);
            visit(dependency);
        }
        visiting.delete(flow.id);
        complete.add(flow.id);
    };
    registry.forEach(visit);
}

/** Playwright exits zero for skips and expected failures; neither proves a critical flow. */
export function assertPassingReport(report, flow = { minimumTests: 1 }) {
    const tests = [];
    const visit = (suite) => {
        for (const spec of suite.specs ?? []) tests.push(...spec.tests);
        for (const child of suite.suites ?? []) visit(child);
    };
    for (const suite of report.suites ?? []) visit(suite);
    if (
        tests.length < flow.minimumTests ||
        report.errors?.length ||
        tests.some(
            (test) =>
                test.expectedStatus !== 'passed' ||
                test.status !== 'expected' ||
                !test.results?.length ||
                test.results.some((result) => result.status !== 'passed'),
        )
    )
        throw new Error(
            'Critical flow did not pass cleanly: missing required tests, skipped, interrupted, flaky, or failed results are not accepted.',
        );
    return tests.length;
}

const featureFlags = {
    ADMIN_E2E_MCP: ['true'],
    AUTH_E2E_SENTENCE_SERVICES: ['true'],
    ADMIN_E2E_SETUP_JOURNEY: ['true'],
    ADMIN_E2E_SYNTHETIC_PROBES: ['true'],
    ADMIN_E2E_ACCESS_TOKEN_TTL: ['60s'],
    LEARNER_PORTRAIT_TEST_PAID: ['true'],
};

export function validateFeatureFlags(flags = {}) {
    for (const [key, value] of Object.entries(flags)) {
        if (
            !Object.hasOwn(featureFlags, key) ||
            !featureFlags[key].includes(value)
        )
            throw new Error(
                `Unsafe critical flow environment override: ${key}`,
            );
    }
}

/** Vitest JSON is checked independently of its exit code: skipped DB suites exit zero. */
export function assertPassingBackendReport(
    report,
    flow,
    backendRoot = resolve('apps/backend'),
) {
    const files = report.testResults;
    const expected = flow.files.map((file) => resolve(backendRoot, file));
    const assertions = Array.isArray(files)
        ? files.flatMap((file) => file.assertionResults ?? [])
        : [];
    if (
        requiredBackendScenarios.some(({ file, titles }) => {
            const result = files?.find(
                (entry) => entry.name === resolve(backendRoot, file),
            );
            return titles.some(
                (title) =>
                    !result?.assertionResults?.some(
                        (test) =>
                            test.title === title && test.status === 'passed',
                    ),
            );
        }) ||
        report.success !== true ||
        !Array.isArray(files) ||
        files.length !== expected.length ||
        new Set(files.map((file) => file.name)).size !== expected.length ||
        files.some(
            (file) =>
                !expected.includes(file.name) ||
                file.status !== 'passed' ||
                file.message ||
                !file.assertionResults?.length,
        ) ||
        !Number.isSafeInteger(report.numTotalTests) ||
        report.numTotalTests < flow.minimumTests ||
        report.numTotalTests !== assertions.length ||
        report.numPassedTests !== assertions.length ||
        [
            'numFailedTests',
            'numPendingTests',
            'numTodoTests',
            'numFailedTestSuites',
            'numPendingTestSuites',
        ].some((key) => report[key] !== 0) ||
        assertions.some(
            (test) =>
                test.status !== 'passed' ||
                test.failureMessages?.length ||
                test.meta?.criticalRetryCount !== 0 ||
                test.meta?.criticalRepeatCount !== 0 ||
                test.meta?.criticalExpectedFailure !== false,
        )
    )
        throw new Error(
            'Critical backend execution contracts did not pass cleanly: missing, unexpected, skipped, flaky, incomplete or failed tests are not accepted.',
        );
    return assertions.length;
}
