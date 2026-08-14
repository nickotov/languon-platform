import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const eslint = new ESLint({ cwd: repositoryRoot });

async function lintSource(filePath, source) {
    const [result] = await eslint.lintText(source, {
        filePath: resolve(repositoryRoot, filePath),
    });

    return result.messages;
}

function boundaryErrors(messages) {
    return messages.filter(({ ruleId }) => ruleId?.startsWith('boundaries/'));
}

test('allows imports toward lower FSD layers through TypeScript aliases', async () => {
    const messages = await lintSource(
        'apps/web/src/fsd/features/auth/lib/boundary-probe.ts',
        "import { useSessionStore } from '@/fsd/entities/session/model/session-store';\nvoid useSessionStore;\n",
    );

    assert.deepEqual(boundaryErrors(messages), []);
});

test('rejects imports toward higher FSD layers through TypeScript aliases', async () => {
    const messages = await lintSource(
        'apps/web/src/fsd/entities/session/model/boundary-probe.ts',
        "import { AuthProvider } from '@/fsd/features/auth';\nvoid AuthProvider;\n",
    );

    assert.equal(boundaryErrors(messages).length, 1);
    assert.equal(
        boundaryErrors(messages)[0]?.ruleId,
        'boundaries/dependencies',
    );
});

test('rejects imports across slices in the same FSD layer', async () => {
    const messages = await lintSource(
        'apps/web/src/fsd/pages/login/ui/boundary-probe.ts',
        "import { SignupPage } from '@/fsd/pages/signup/ui/signup-page';\nvoid SignupPage;\n",
    );

    assert.equal(boundaryErrors(messages).length, 1);
    assert.equal(
        boundaryErrors(messages)[0]?.ruleId,
        'boundaries/dependencies',
    );
});

test('allows Next app composition to import lower FSD layers', async () => {
    const messages = await lintSource(
        'apps/admin/src/app/boundary-probe.ts',
        "import { DashboardPage } from '@/fsd/pages/dashboard/ui/dashboard-page';\nvoid DashboardPage;\n",
    );

    assert.deepEqual(boundaryErrors(messages), []);
});

test('allows recognized Next framework files to import same-app FSD slices', async () => {
    const results = await Promise.all(
        ['apps/web/instrumentation.ts', 'apps/web/src/instrumentation.ts'].map(
            (filePath) =>
                lintSource(
                    filePath,
                    "import { safeReturnPath } from '@/fsd/shared/lib/return-path';\nvoid safeReturnPath;\n",
                ),
        ),
    );

    assert.deepEqual(results.flatMap(boundaryErrors), []);
});

test('rejects imports across frontend applications', async () => {
    const messages = await lintSource(
        'apps/web/src/app/boundary-probe.ts',
        "import { DashboardPage } from '../../../admin/src/fsd/pages/dashboard/ui/dashboard-page';\nvoid DashboardPage;\n",
    );

    assert.equal(boundaryErrors(messages).length, 1);
    assert.equal(
        boundaryErrors(messages)[0]?.ruleId,
        'boundaries/dependencies',
    );
});

test('rejects cross-app imports from root Next framework files', async () => {
    const messages = await lintSource(
        'apps/web/instrumentation.ts',
        "import { DashboardPage } from '../admin/src/fsd/pages/dashboard/ui/dashboard-page';\nvoid DashboardPage;\n",
    );

    assert.equal(boundaryErrors(messages).length, 1);
    assert.equal(
        boundaryErrors(messages)[0]?.ruleId,
        'boundaries/dependencies',
    );
});

test('rejects source files in unsupported FSD layers', async () => {
    const messages = await lintSource(
        'apps/web/src/fsd/unsupported/boundary-probe.ts',
        'export const unsupported = true;\n',
    );

    assert.equal(boundaryErrors(messages).length, 1);
    assert.equal(
        boundaryErrors(messages)[0]?.ruleId,
        'boundaries/no-unknown-files',
    );
});

test('rejects unclassified frontend source folders', async () => {
    const messages = await lintSource(
        'apps/web/src/components/boundary-probe.ts',
        'export const unsupported = true;\n',
    );

    assert.equal(boundaryErrors(messages).length, 1);
    assert.equal(
        boundaryErrors(messages)[0]?.ruleId,
        'boundaries/no-unknown-files',
    );
});
