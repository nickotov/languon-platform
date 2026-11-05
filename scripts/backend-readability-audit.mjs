import { readdir, readFile } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const excludedDirectories = new Set([
    '__tests__',
    '__fixtures__',
    'tests',
    'fixtures',
    'generated',
    '__generated__',
    'node_modules',
    'dist',
    'coverage',
    '.mastra',
]);

export const thresholds = { fileLines: 500, functionBodyLines: 100 };

function physicalLines(source) {
    if (!source) {
        return [];
    }

    const lines = source.split(/\r\n|\n|\r/);

    if (lines.at(-1) === '') {
        lines.pop();
    }

    return lines;
}

function isGenerated(source) {
    const comments = ts.getLeadingCommentRanges(source, 0) ?? [];

    return comments.some(({ pos, end }) =>
        /@generated\b|code generated[\s\S]*do not edit/i.test(
            source.slice(pos, end),
        ),
    );
}

function functionName(node, sourceFile) {
    if (ts.isConstructorDeclaration(node)) {
        return `${node.parent.name?.getText(sourceFile) ?? '<class>'}.constructor`;
    }

    if (node.name) {
        const owner = ts.isClassLike(node.parent)
            ? `${node.parent.name?.getText(sourceFile) ?? '<class>'}.`
            : '';

        return `${owner}${node.name.getText(sourceFile)}`;
    }

    for (let parent = node.parent; parent; parent = parent.parent) {
        if (
            ts.isVariableDeclaration(parent) ||
            ts.isPropertyAssignment(parent) ||
            ts.isPropertyDeclaration(parent)
        ) {
            return parent.name.getText(sourceFile);
        }

        if (ts.isExportAssignment(parent)) {
            return 'default export';
        }

        if (ts.isCallExpression(parent)) {
            return `${parent.expression.getText(sourceFile).slice(0, 80)} callback`;
        }

        if (ts.isFunctionLike(parent)) {
            break;
        }
    }

    return '<anonymous>';
}

export function analyzeSource(path, source) {
    const sourceFile = ts.createSourceFile(
        path,
        source,
        ts.ScriptTarget.Latest,
        true,
        path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    if (sourceFile.parseDiagnostics.length) {
        const message = ts.flattenDiagnosticMessageText(
            sourceFile.parseDiagnostics[0].messageText,
            ' ',
        );

        throw new Error(`Cannot parse ${path}: ${message}`);
    }

    const functions = [];

    function visit(node) {
        if (ts.isFunctionLike(node) && node.body) {
            const startLine =
                sourceFile.getLineAndCharacterOfPosition(
                    node.body.getStart(sourceFile),
                ).line + 1;
            const endLine =
                sourceFile.getLineAndCharacterOfPosition(node.body.end - 1)
                    .line + 1;

            functions.push({
                name: functionName(node, sourceFile),
                startLine,
                endLine,
                bodyLines: endLine - startLine + 1,
            });
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    const lines = physicalLines(source);
    const longFunctions = functions
        .filter(({ bodyLines }) => bodyLines > thresholds.functionBodyLines)
        .sort(
            (left, right) =>
                right.bodyLines - left.bodyLines ||
                left.startLine - right.startLine,
        );
    // Names indicate a review category, not an exemption or an extraction rule.
    const declarativeHint =
        /(?:^|[-.])(schemas?|catalog|environment|config|data)(?:[-.]|$)/i.test(
            basename(path),
        );

    return {
        path,
        category: declarativeHint ? 'declarative-review' : 'implementation',
        physicalLines: lines.length,
        nonblankLines: lines.filter((line) => line.trim()).length,
        functionCount: functions.length,
        longestFunctionBodyLines: Math.max(
            0,
            ...functions.map((fn) => fn.bodyLines),
        ),
        longFunctions,
        reasons: [
            ...(lines.length > thresholds.fileLines ? ['large-file'] : []),
            ...(longFunctions.length ? ['long-function'] : []),
        ],
    };
}

async function runtimeFiles(directory) {
    const paths = [];

    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);

        if (entry.isDirectory() && !excludedDirectories.has(entry.name)) {
            paths.push(...(await runtimeFiles(path)));
        } else if (
            entry.isFile() &&
            /\.tsx?$/.test(entry.name) &&
            !/\.(?:d|test|spec|generated)\.tsx?$/.test(entry.name)
        ) {
            paths.push(path);
        }
    }

    return paths.sort();
}

export async function auditBackendReadability(root = repositoryRoot) {
    const candidates = [];
    let scannedFiles = 0;

    for (const path of await runtimeFiles(join(root, 'apps/backend/src'))) {
        const source = await readFile(path, 'utf8');

        if (isGenerated(source)) {
            continue;
        }

        scannedFiles += 1;
        const metrics = analyzeSource(
            relative(root, path).split('\\').join('/'),
            source,
        );

        if (metrics.reasons.length) {
            candidates.push(metrics);
        }
    }

    candidates.sort(
        (left, right) =>
            Number(left.category === 'declarative-review') -
                Number(right.category === 'declarative-review') ||
            right.longestFunctionBodyLines - left.longestFunctionBodyLines ||
            right.physicalLines - left.physicalLines ||
            left.path.localeCompare(right.path),
    );

    return {
        thresholds,
        scannedFiles,
        candidateCount: candidates.length,
        candidates,
    };
}

export function formatReport(report) {
    const selected = report.candidates.slice(0, 20);
    const lines = [
        `Backend readability review: ${report.candidateCount} candidates / ${report.scannedFiles} runtime files.`,
        `Signals: >${thresholds.fileLines} physical file lines or >${thresholds.functionBodyLines} function body lines (including braces, comments and blanks).`,
        'Advisory only; declarative categories are filename hints. Review responsibilities before splitting.',
        `Categories: ${report.candidates.filter((file) => file.category === 'implementation').length} implementation; ${report.candidates.filter((file) => file.category === 'declarative-review').length} declarative-review.`,
        '',
    ];

    for (const category of ['implementation', 'declarative-review']) {
        const files = selected.filter((file) => file.category === category);

        if (!files.length) {
            continue;
        }

        lines.push(`${category}:`);

        for (const file of files) {
            lines.push(
                `  ${file.path}: ${file.physicalLines} lines / ${file.nonblankLines} nonblank; ${file.functionCount} functions; longest body ${file.longestFunctionBodyLines} lines`,
            );

            for (const fn of file.longFunctions.slice(0, 3)) {
                lines.push(
                    `    ${fn.name} at ${fn.startLine}: ${fn.bodyLines} body lines`,
                );
            }
        }
    }

    lines.push(
        '',
        `Showing ${selected.length}/${report.candidateCount}; --json includes every candidate and long function.`,
    );

    return lines.join('\n');
}

export async function runCli(
    args = process.argv.slice(2),
    root = repositoryRoot,
) {
    if (
        args.length > 1 ||
        (args.length === 1 && !['--json', '--help'].includes(args[0]))
    ) {
        throw new Error(
            'Usage: pnpm audit:backend-readability [--json|--help]',
        );
    }

    if (args[0] === '--help') {
        return 'Usage: pnpm audit:backend-readability [--json|--help]\nRead-only advisory inventory; --json returns all candidates.';
    }

    const report = await auditBackendReadability(root);

    return args[0] === '--json'
        ? JSON.stringify(report, null, 2)
        : formatReport(report);
}

if (
    process.argv[1] &&
    resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
    try {
        console.log(await runCli());
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
