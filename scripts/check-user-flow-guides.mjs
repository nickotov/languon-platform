import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const guidesDirectory = join(repositoryRoot, 'docs', 'user-flows');
const indexPath = join(guidesDirectory, 'README.md');
const maximumTestFileBytes = 2 * 1024 * 1024;
export const e2eCommands = new Map([
    ['admin-user-management', 'pnpm test:e2e:admin-user-management'],
    [
        'deployment-local-rehearsal',
        'LANGUON_DEPLOY_E2E=true node --test infra/deploy/tests/local-rehearsal.journeys.test.mjs',
    ],
    ['mastra-playground-vitest', 'node scripts/run-mastra-playground-e2e.mjs'],
    ['web-playwright', 'pnpm --filter @languon/web test:e2e'],
]);
const allowedKeys = new Set([
    'e2e_command',
    'e2e_scenarios',
    'e2e_tests',
    'feature',
    'last_verified',
    'related_features',
    'source_paths',
    'status',
    'surfaces',
    'title',
]);
const allowedStatuses = new Set(['current', 'draft', 'retired']);
const surfaceHeadings = new Map([
    ['admin', 'Admin verification'],
    ['api', 'API verification'],
    ['browser', 'Browser verification'],
    ['cli', 'CLI verification'],
    ['mobile', 'Mobile verification'],
    ['system', 'System verification'],
]);
const alwaysRequiredHeadings = [
    'What this verifies',
    'Start the development environment',
    'Expected failure and edge cases',
    'Automated regression checks',
    'Troubleshooting',
    'Cleanup',
];

export function parseFrontmatter(content, filename) {
    const match = /^---\n([\s\S]*?)\n---\n/.exec(content);
    if (!match) {
        throw new Error(`${filename}: missing YAML frontmatter`);
    }

    const metadata = new Map();
    let activeList;

    for (const [lineIndex, line] of match[1].split('\n').entries()) {
        const listItem = /^ {2,}- (.+)$/.exec(line);
        if (listItem) {
            if (!activeList) {
                throw new Error(
                    `${filename}:${lineIndex + 2}: list item has no parent key`,
                );
            }
            const item = listItem[1].trim();
            assertNoControlCharacters(item, filename, activeList);
            metadata.get(activeList).push(item);
            continue;
        }

        const property = /^([a-z][a-z0-9_]*):(?: (.*))?$/.exec(line);
        if (!property) {
            throw new Error(
                `${filename}:${lineIndex + 2}: unsupported frontmatter syntax`,
            );
        }

        const [, key, rawValue = ''] = property;
        if (!allowedKeys.has(key)) {
            throw new Error(
                `${filename}: unsupported frontmatter key '${key}'`,
            );
        }
        if (metadata.has(key)) {
            throw new Error(`${filename}: duplicate frontmatter key '${key}'`);
        }

        if (rawValue === '') {
            metadata.set(key, []);
            activeList = key;
        } else {
            const value = rawValue.trim();
            assertNoControlCharacters(value, filename, key);
            metadata.set(key, value);
            activeList = undefined;
        }
    }

    return {
        body: content.slice(match[0].length).replace(/^\n/, ''),
        metadata,
    };
}

function assertNoControlCharacters(value, filename, key) {
    const hasControlCharacter = [...value].some((character) => {
        const codePoint = character.codePointAt(0);
        return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
    });
    if (hasControlCharacter) {
        throw new Error(
            `${filename}: '${key}' must not contain control characters`,
        );
    }
}

function escapedDiagnostic(value) {
    return JSON.stringify(value).slice(1, -1);
}

function assertSafeFilesystemName(value, kind) {
    try {
        assertNoControlCharacters(value, kind, kind);
    } catch {
        throw new Error(
            `${kind} '${escapedDiagnostic(value)}' must not contain control characters`,
        );
    }
}

function requireScalar(metadata, key, filename) {
    const value = metadata.get(key);
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`${filename}: '${key}' must be a non-empty scalar`);
    }
    return value;
}

function requireList(metadata, key, filename) {
    const value = metadata.get(key);
    if (
        !Array.isArray(value) ||
        value.length === 0 ||
        value.some((item) => item.trim().length === 0)
    ) {
        throw new Error(`${filename}: '${key}' must be a non-empty list`);
    }
    return value;
}

function assertValidDate(value, filename) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error(`${filename}: 'last_verified' must use YYYY-MM-DD`);
    }
    const date = new Date(`${value}T00:00:00Z`);
    if (
        Number.isNaN(date.valueOf()) ||
        date.toISOString().slice(0, 10) !== value
    ) {
        throw new Error(`${filename}: 'last_verified' is not a real date`);
    }
}

export function sectionsByHeading(body) {
    const sections = new Map();
    let activeHeading;
    let activeContent = [];
    let fenced = false;

    const saveActiveSection = () => {
        if (activeHeading) {
            sections.set(activeHeading, activeContent.join('\n').trim());
        }
    };

    for (const line of body.split('\n')) {
        if (/^\s*(?:```|~~~)/.test(line)) {
            fenced = !fenced;
            if (activeHeading) activeContent.push(line);
            continue;
        }
        const heading = fenced ? null : /^## ([^#].*)$/.exec(line);
        if (heading?.[1]) {
            saveActiveSection();
            activeHeading = heading[1].trim();
            activeContent = [];
        } else if (activeHeading) {
            activeContent.push(line);
        }
    }
    saveActiveSection();

    return sections;
}

function assertSection(sections, heading, filename) {
    const content = sections.get(heading);
    if (content === undefined) {
        throw new Error(
            `${filename}: missing required '## ${heading}' section`,
        );
    }
    const substantiveContent = content
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/^\s*(?:```|~~~).*$/gm, '')
        .trim();
    if (substantiveContent.length === 0) {
        throw new Error(
            `${filename}: required '## ${heading}' section is empty`,
        );
    }
}

function hasIndexLink(index, filename) {
    let fenced = false;
    const indexWithoutComments = index.replace(/<!--[\s\S]*?-->/g, '');

    for (const line of indexWithoutComments.split('\n')) {
        if (/^\s*(?:```|~~~)/.test(line)) {
            fenced = !fenced;
            continue;
        }
        const lineWithoutInlineCode = line.replace(/`[^`\n]*`/g, '');
        const targets = [
            ...lineWithoutInlineCode.matchAll(/\]\(([^)]+)\)/g),
        ].map((match) => match[1]);
        if (!fenced && targets.includes(`./${filename}`)) {
            return true;
        }
    }

    return false;
}

function assertRepositoryPath(value, filename, kind) {
    if (
        value.startsWith('/') ||
        value.startsWith('./') ||
        value.includes('..') ||
        value.includes('\\')
    ) {
        throw new Error(
            `${filename}: ${kind} '${value}' must be repository-relative`,
        );
    }
}

function assertUnique(values, key, filename) {
    if (new Set(values).size !== values.length) {
        throw new Error(`${filename}: '${key}' must not contain duplicates`);
    }
}

function escapeRegularExpression(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function computeE2eRevision({
    e2eCommand,
    e2eCommandId,
    feature,
    scenarios,
    sections,
    surfaces,
}) {
    const relevantHeadings = [
        'What this verifies',
        'Start the development environment',
        ...surfaces.map((surface) => surfaceHeadings.get(surface)),
        'Expected failure and edge cases',
        'E2E coverage',
    ];
    const canonical = {
        e2eCommand,
        e2eCommandId,
        feature,
        scenarios,
        sections: relevantHeadings.map((heading) => [
            heading,
            sections.get(heading) ?? '',
        ]),
        surfaces,
    };
    const digest = createHash('sha256')
        .update(JSON.stringify(canonical))
        .digest('hex')
        .slice(0, 16);

    return `sha256:${digest}`;
}

function validateE2eMetadata({
    feature,
    filename,
    metadata,
    sections,
    status,
    surfaces,
}) {
    const e2eKeys = ['e2e_command', 'e2e_tests', 'e2e_scenarios'];
    const hasAnyE2eMetadata = e2eKeys.some((key) => metadata.has(key));
    if (status !== 'current' && !hasAnyE2eMetadata) return undefined;

    const e2eCommandId = requireScalar(metadata, 'e2e_command', filename);
    const e2eCommand = e2eCommands.get(e2eCommandId);
    if (!e2eCommand) {
        throw new Error(
            `${filename}: 'e2e_command' must be a registered command ID (${[
                ...e2eCommands.keys(),
            ].join(', ')})`,
        );
    }
    const testPaths = requireList(metadata, 'e2e_tests', filename);
    const scenarios = requireList(metadata, 'e2e_scenarios', filename);
    assertUnique(testPaths, 'e2e_tests', filename);
    assertUnique(scenarios, 'e2e_scenarios', filename);
    assertSection(sections, 'E2E coverage', filename);
    const coverageSection = sections.get('E2E coverage');

    for (const testPath of testPaths) {
        assertRepositoryPath(testPath, filename, 'E2E test path');
        if (
            ['*', '?', '[', ']', '{', '}', '!'].some((character) =>
                testPath.includes(character),
            )
        ) {
            throw new Error(
                `${filename}: E2E test path '${testPath}' must be an exact path without glob syntax`,
            );
        }
        if (!/\.(?:e2e|spec|test)\.[cm]?[jt]sx?$/.test(testPath)) {
            throw new Error(
                `${filename}: E2E test path '${testPath}' must name an e2e, spec, or test source file`,
            );
        }
    }

    for (const scenario of scenarios) {
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(scenario)) {
            throw new Error(
                `${filename}: E2E scenario '${scenario}' must be a kebab-case slug`,
            );
        }
        const documentedScenario = new RegExp(
            `(?:^|[^a-z0-9-])\`${escapeRegularExpression(scenario)}\`(?:$|[^a-z0-9-])`,
        );
        const coverageLine = coverageSection
            .split('\n')
            .find((line) => documentedScenario.test(line));
        if (!coverageLine) {
            throw new Error(
                `${filename}: E2E coverage must document scenario '${scenario}' in backticks`,
            );
        }
        const explanation = coverageLine
            .replace(/`[a-z0-9]+(?:-[a-z0-9]+)*`/g, '')
            .replace(/[|#*_`:[\](){}>-]/g, '')
            .trim();
        if (!/[\p{L}\p{N}]{3}/u.test(explanation)) {
            throw new Error(
                `${filename}: E2E coverage must explain what scenario '${scenario}' proves`,
            );
        }
    }

    return {
        command: e2eCommand,
        commandId: e2eCommandId,
        feature,
        revision: computeE2eRevision({
            e2eCommand,
            e2eCommandId,
            feature,
            scenarios,
            sections,
            surfaces,
        }),
        scenarios,
        testPaths,
    };
}

function malformedMarker(line) {
    return /^\/\/ @user-flow(?:-revision)?(?:\s|$)/.test(line);
}

function lineMarkerCount(content, marker) {
    return content.split('\n').filter((line) => line.trim() === `// ${marker}`)
        .length;
}

export function validateE2eTestFiles(e2e, testFiles, filename) {
    const scenarioCounts = new Map(
        e2e.scenarios.map((scenario) => [scenario, 0]),
    );
    const featureMarker = new RegExp(
        `^// @user-flow ${escapeRegularExpression(e2e.feature)}/([a-z0-9]+(?:-[a-z0-9]+)*)$`,
    );

    for (const testPath of e2e.testPaths) {
        const content = testFiles.get(testPath);
        if (content === undefined) {
            throw new Error(
                `${filename}: E2E test file '${testPath}' does not exist`,
            );
        }
        const revisionMarker = `@user-flow-revision ${e2e.feature} ${e2e.revision}`;
        const revisionCount = lineMarkerCount(content, revisionMarker);
        if (revisionCount !== 1) {
            throw new Error(
                `${filename}: '${testPath}' must contain exactly one '// ${revisionMarker}' marker`,
            );
        }

        let fileScenarioCount = 0;
        for (const line of content.split('\n')) {
            const marker = featureMarker.exec(line.trim());
            if (!marker) continue;
            const scenario = marker[1];
            if (!scenarioCounts.has(scenario)) {
                throw new Error(
                    `${filename}: '${testPath}' marks undeclared scenario '${scenario}'`,
                );
            }
            scenarioCounts.set(scenario, scenarioCounts.get(scenario) + 1);
            fileScenarioCount += 1;
        }
        if (fileScenarioCount === 0) {
            throw new Error(
                `${filename}: '${testPath}' must contain at least one declared scenario marker`,
            );
        }
    }

    for (const [scenario, count] of scenarioCounts) {
        if (count !== 1) {
            throw new Error(
                `${filename}: E2E scenario '${scenario}' must have exactly one ` +
                    `'// @user-flow ${e2e.feature}/${scenario}' marker; found ${count}`,
            );
        }
    }
}

export function validateE2eMarkerRegistry(
    e2eByFeature,
    testFiles,
    selectedFeature,
) {
    const scenarioMarker =
        /^\/\/ @user-flow ([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;
    const revisionMarker =
        /^\/\/ @user-flow-revision ([a-z0-9]+(?:-[a-z0-9]+)*) (sha256:[a-f0-9]{16})$/;

    for (const [testPath, content] of testFiles) {
        assertSafeFilesystemName(testPath, 'E2E test path');
        const diagnosticPath = escapedDiagnostic(testPath);
        for (const line of content.split('\n')) {
            const normalizedLine = line.trim();
            const scenario = scenarioMarker.exec(normalizedLine);
            const revision = revisionMarker.exec(normalizedLine);
            if (malformedMarker(normalizedLine) && !scenario && !revision) {
                throw new Error(
                    `${diagnosticPath}: malformed user-flow marker '${escapedDiagnostic(normalizedLine)}'`,
                );
            }
            const feature = scenario?.[1] ?? revision?.[1];
            if (!feature || (selectedFeature && feature !== selectedFeature))
                continue;

            const e2e = e2eByFeature.get(feature);
            if (!e2e) {
                throw new Error(
                    `${diagnosticPath}: user-flow marker references unknown current guide '${feature}'`,
                );
            }
            if (!e2e.testPaths.includes(testPath)) {
                throw new Error(
                    `${diagnosticPath}: user-flow marker for '${feature}' is orphaned because the guide does not declare this test file`,
                );
            }
            if (scenario && !e2e.scenarios.includes(scenario[2])) {
                throw new Error(
                    `${diagnosticPath}: user-flow marker references undeclared scenario '${scenario[2]}' for '${feature}'`,
                );
            }
            if (revision && revision[2] !== e2e.revision) {
                throw new Error(
                    `${diagnosticPath}: user-flow revision '${revision[2]}' is stale; expected '${e2e.revision}'`,
                );
            }
        }
    }
}

async function readRepositoryTestFile(testPath, filename) {
    assertSafeFilesystemName(testPath, 'E2E test path');
    const pathParts = testPath.split('/');
    let candidate = repositoryRoot;
    for (const part of pathParts) {
        candidate = join(candidate, part);
        let pathStats;
        try {
            pathStats = await lstat(candidate);
        } catch (error) {
            if (error && typeof error === 'object' && error.code === 'ENOENT') {
                return undefined;
            }
            throw error;
        }
        if (pathStats.isSymbolicLink()) {
            throw new Error(
                `${filename}: E2E test path '${testPath}' must not contain symbolic links`,
            );
        }
    }

    const [rootRealPath, candidateRealPath, candidateStats] = await Promise.all(
        [realpath(repositoryRoot), realpath(candidate), stat(candidate)],
    );
    const relativeTarget = relative(rootRealPath, candidateRealPath);
    if (
        relativeTarget === '..' ||
        relativeTarget.startsWith(`..${sep}`) ||
        isAbsolute(relativeTarget)
    ) {
        throw new Error(
            `${filename}: E2E test path '${testPath}' resolves outside the repository`,
        );
    }
    if (!candidateStats.isFile()) {
        throw new Error(
            `${filename}: E2E test path '${testPath}' must be a regular file`,
        );
    }
    if (candidateStats.size > maximumTestFileBytes) {
        throw new Error(
            `${filename}: E2E test path '${testPath}' exceeds ${maximumTestFileBytes} bytes`,
        );
    }
    return readFile(candidateRealPath, 'utf8');
}

export function validateGuide(content, filename, index) {
    const { body, metadata } = parseFrontmatter(content, filename);
    const feature = requireScalar(metadata, 'feature', filename);
    const title = requireScalar(metadata, 'title', filename);
    const status = requireScalar(metadata, 'status', filename);
    const lastVerified = requireScalar(metadata, 'last_verified', filename);
    const surfaces = requireList(metadata, 'surfaces', filename);
    const sourcePaths = requireList(metadata, 'source_paths', filename);
    const expectedFilename = `${feature}.md`;
    const sections = sectionsByHeading(body);

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(feature)) {
        throw new Error(`${filename}: 'feature' must be a kebab-case slug`);
    }
    if (filename !== expectedFilename) {
        throw new Error(
            `${filename}: filename must match feature slug '${expectedFilename}'`,
        );
    }
    if (!allowedStatuses.has(status)) {
        throw new Error(
            `${filename}: 'status' must be current, draft, or retired`,
        );
    }
    assertValidDate(lastVerified, filename);
    assertUnique(surfaces, 'surfaces', filename);
    assertUnique(sourcePaths, 'source_paths', filename);

    for (const surface of new Set(surfaces)) {
        const heading = surfaceHeadings.get(surface);
        if (!heading) {
            throw new Error(`${filename}: unsupported surface '${surface}'`);
        }
        assertSection(sections, heading, filename);
    }

    for (const sourcePath of sourcePaths) {
        assertRepositoryPath(sourcePath, filename, 'source path');
    }

    if (!body.startsWith(`# ${title}\n`)) {
        throw new Error(`${filename}: first heading must be '# ${title}'`);
    }
    for (const heading of alwaysRequiredHeadings) {
        assertSection(sections, heading, filename);
    }
    if (!hasIndexLink(index, filename)) {
        throw new Error(`${filename}: guide is missing from README.md index`);
    }

    return {
        body,
        e2e: validateE2eMetadata({
            feature,
            filename,
            metadata,
            sections,
            status,
            surfaces,
        }),
        feature,
        metadata,
        sections,
    };
}

export async function readE2eTestFiles(e2e) {
    const testFiles = new Map();
    for (const testPath of e2e.testPaths) {
        const content = await readRepositoryTestFile(testPath, e2e.feature);
        if (content !== undefined) testFiles.set(testPath, content);
    }
    return testFiles;
}

const ignoredTestScanDirectories = new Set([
    '.git',
    '.pnpm-store',
    '.serena',
    '.expo',
    '.next',
    '.turbo',
    'build',
    'coverage',
    'dist',
    'node_modules',
    'playwright-report',
    'test-results',
]);

async function scanTestFiles(directory, relativeDirectory = '') {
    const files = new Map();
    let entries;
    try {
        entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
        if (error && typeof error === 'object' && error.code === 'ENOENT') {
            return files;
        }
        throw error;
    }

    for (const entry of entries) {
        const relativePath = relativeDirectory
            ? `${relativeDirectory}/${entry.name}`
            : entry.name;
        const absolutePath = join(directory, entry.name);
        if (entry.isDirectory()) {
            if (ignoredTestScanDirectories.has(entry.name)) continue;
            for (const [path, content] of await scanTestFiles(
                absolutePath,
                relativePath,
            )) {
                files.set(path, content);
            }
            continue;
        }
        if (
            entry.isFile() &&
            /\.(?:e2e|spec|test)\.[cm]?[jt]sx?$/.test(entry.name)
        ) {
            const content = await readRepositoryTestFile(
                relativePath,
                'test scan',
            );
            if (content !== undefined) files.set(relativePath, content);
        }
    }
    return files;
}

export async function scanRepositoryTestFiles() {
    return scanTestFiles(repositoryRoot);
}

export async function checkUserFlowGuides(options = {}) {
    const entries = await readdir(guidesDirectory, { withFileTypes: true });
    const filenames = entries
        .filter(
            (entry) =>
                entry.isFile() &&
                entry.name.endsWith('.md') &&
                entry.name !== 'README.md',
        )
        .map((entry) => entry.name)
        .filter((filename) =>
            options.feature ? filename === `${options.feature}.md` : true,
        )
        .sort();

    for (const filename of filenames) {
        assertSafeFilesystemName(filename, 'user-flow guide filename');
    }

    if (filenames.length === 0) {
        if (options.feature) {
            throw new Error(
                `docs/user-flows/${options.feature}.md does not exist`,
            );
        }
        throw new Error(
            'docs/user-flows must contain at least one feature guide',
        );
    }

    const index = await readFile(indexPath, 'utf8');
    const failures = [];
    const e2eByFeature = new Map();

    for (const filename of filenames) {
        try {
            const guide = validateGuide(
                await readFile(join(guidesDirectory, filename), 'utf8'),
                filename,
                index,
            );
            if (guide.e2e) {
                e2eByFeature.set(guide.feature, guide.e2e);
                validateE2eTestFiles(
                    guide.e2e,
                    await readE2eTestFiles(guide.e2e),
                    filename,
                );
            }
        } catch (error) {
            failures.push(
                error instanceof Error ? error.message : String(error),
            );
        }
    }

    try {
        validateE2eMarkerRegistry(
            e2eByFeature,
            await scanRepositoryTestFiles(),
            options.feature,
        );
    } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
    }

    if (failures.length > 0) {
        throw new Error(failures.map((failure) => `- ${failure}`).join('\n'));
    }

    console.log(
        `Validated ${filenames.length} user-flow guide(s) and E2E mappings.`,
    );
}

if (
    process.argv[1] &&
    resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
    await checkUserFlowGuides().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}
