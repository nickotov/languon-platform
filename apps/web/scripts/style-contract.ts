import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import postcss from 'postcss';
import ts from 'typescript';

import { inspectComponentStructure } from './component-structure';
import { findUtilityClasses } from './style-utilities';

export const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const tokenPath = join(webRoot, 'src/app/styles/geometry-tokens.css');

export function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true })
        .flatMap((entry) => {
            const path = join(directory, entry.name);

            return entry.isDirectory() ? sourceFiles(path) : [path];
        })
        .sort();
}

// Relative em values, percentages, viewport units, grid fractions, media thresholds,
// and thin border widths intentionally retain their CSS semantics.
export function tokenFamily(property: string): string | undefined {
    if (property === '--radius-full') {
        return undefined;
    }

    if (
        property === '--app-sidebar-center-offset' ||
        property.startsWith('--elevation-')
    ) {
        return 'size';
    }

    if (
        /^--style-(?:translate-[xy]|border-spacing-[xy]|ring-offset-width|(?:ring-offset-|ring-)?shadow(?:-colored)?)$/.test(
            property,
        )
    ) {
        return 'size';
    }

    if (/^--(?:spacing|space|sys-space)-/.test(property)) {
        return 'space';
    }

    if (/^--(?:size|radius|sys-radius)-/.test(property)) {
        return property.includes('radius') ? 'radius' : 'size';
    }

    if (property.startsWith('--')) {
        return undefined;
    }

    if (
        [
            'line-height',
            'text-decoration-thickness',
            'text-underline-offset',
        ].includes(property)
    ) {
        return 'size';
    }

    if (/radius$/.test(property)) {
        return 'radius';
    }

    if (
        /^(?:margin|padding|gap|row-gap|column-gap|scroll-margin|scroll-padding)(?:-|$)/.test(
            property,
        )
    ) {
        return 'space';
    }

    if (
        /^(?:(?:min-|max-)?(?:width|height|inline-size|block-size)|inset(?:-.+)?|top|right|bottom|left|flex(?:-basis)?|(?:backdrop-)?filter|font-size|letter-spacing|text-indent|outline-offset|border-spacing|box-shadow|text-shadow|transform|translate|perspective|vertical-align|grid-template-(?:columns|rows)|grid-auto-(?:columns|rows))$/.test(
            property,
        )
    ) {
        return 'size';
    }

    return undefined;
}

export function tokenName(family: string, pixels: number): string {
    return `--${family}-${String(Number(Math.abs(pixels).toFixed(6))).replace('.', '-')}`;
}

export function replaceLengths(
    value: string,
    replace: (pixels: number) => string,
): string {
    // Quoted content and URLs are opaque, not dimension expressions.
    return value.replace(
        /url\([^)]*\)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|(?<![\w.-])(-?(?:\d*\.\d+|\d+))(px|rem)\b/g,
        (match, number: string | undefined, unit: string | undefined) => {
            if (number === undefined) {
                return match;
            }

            const pixels = Number(number) * (unit === 'rem' ? 16 : 1);

            return pixels === 0 ? match : replace(pixels);
        },
    );
}

export function inspectMarkup(
    source: string,
    filename = 'component.tsx',
): string[] {
    const file = ts.createSourceFile(
        filename,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
    );
    const bindings = new Map<string, ts.Node>();
    const violations = new Set<string>();
    const visit = (node: ts.Node) => {
        if (
            ts.isVariableDeclaration(node) &&
            ts.isIdentifier(node.name) &&
            node.initializer
        ) {
            bindings.set(node.name.text, node.initializer);
        }

        if (ts.isFunctionDeclaration(node) && node.name && node.body) {
            bindings.set(node.name.text, node.body);
        }

        ts.forEachChild(node, visit);
    };

    visit(file);
    const isStatic = (node: ts.Node, seen = new Set<string>()): boolean => {
        if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) {
            return true;
        }

        if (ts.isPrefixUnaryExpression(node)) {
            return isStatic(node.operand, seen);
        }

        if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) {
            return isStatic(node.expression, seen);
        }

        if (ts.isIdentifier(node) && !seen.has(node.text)) {
            const binding = bindings.get(node.text);
            if (binding) {
                return isStatic(binding, new Set([...seen, node.text]));
            }
        }

        return false;
    };
    const inspectStyle = (node: ts.Node, seen = new Set<string>()) => {
        if (ts.isTypeNode(node) || ts.isVariableStatement(node)) {
            return;
        }

        if (ts.isIdentifier(node) && !seen.has(node.text)) {
            const binding = bindings.get(node.text);
            if (binding) {
                inspectStyle(binding, new Set([...seen, node.text]));
            }
        }

        if (ts.isObjectLiteralExpression(node)) {
            for (const property of node.properties) {
                if (ts.isSpreadAssignment(property)) {
                    inspectStyle(property.expression, seen);
                }

                if (
                    ts.isPropertyAssignment(property) &&
                    !ts.isComputedPropertyName(property.name) &&
                    isStatic(property.initializer)
                ) {
                    violations.add(
                        `Static inline presentation: ${property.name.getText(file)}`,
                    );
                }
            }

            return;
        }

        ts.forEachChild(node, (child) => inspectStyle(child, seen));
    };
    const inspect = (
        node: ts.Node,
        classContext: boolean,
        seen = new Set<string>(),
    ) => {
        if (
            classContext &&
            (ts.isPropertyAssignment(node) ||
                ts.isShorthandPropertyAssignment(node)) &&
            ts.isIdentifier(node.name)
        ) {
            findUtilityClasses(node.name.text, true).forEach((token) =>
                violations.add(`Tailwind utility: ${token}`),
            );
        }

        if (
            ts.isStringLiteralLike(node) ||
            ts.isTemplateHead(node) ||
            ts.isTemplateMiddle(node) ||
            ts.isTemplateTail(node)
        ) {
            findUtilityClasses(node.text, classContext).forEach((token) =>
                violations.add(`Tailwind utility: ${token}`),
            );
        }

        if (classContext && ts.isIdentifier(node) && !seen.has(node.text)) {
            const binding = bindings.get(node.text);
            if (binding) {
                inspect(binding, true, new Set([...seen, node.text]));
            }
        }

        ts.forEachChild(node, (child) => inspect(child, classContext, seen));
    };
    const inspectAttributes = (node: ts.Node) => {
        if (ts.isJsxAttribute(node) && node.initializer) {
            const name = node.name.getText(file);
            if (/(?:^className$|ClassName$)/.test(name)) {
                inspect(node.initializer, true);
            }

            // Satori ImageResponse cannot consume browser CSS Modules. This sole
            // framework-rendered image retains static inline declarations.
            if (name === 'style' && !/(?:^|\/)app\/icon\.tsx$/.test(filename)) {
                inspectStyle(node.initializer);
            }
        }

        // Utility-like string fragments in helpers/variant tables are checked even
        // when their className consumer lives in a different module.
        if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) {
            if (
                ts.isStringLiteralLike(node) ||
                ts.isTemplateHead(node) ||
                ts.isTemplateMiddle(node) ||
                ts.isTemplateTail(node)
            ) {
                inspect(node, false);
            }

            ts.forEachChild(node, inspectAttributes);
        }
    };

    inspectAttributes(file);

    return [...violations];
}

export function inspectCss(
    source: string,
    filename = 'component.module.css',
    declaredTokens?: ReadonlySet<string>,
): string[] {
    const errors: string[] = [];
    const root = postcss.parse(source, { from: filename });
    root.walkAtRules((rule) => {
        if (
            [
                'tailwind',
                'apply',
                'screen',
                'theme',
                'utility',
                'variant',
            ].includes(rule.name)
        ) {
            errors.push(`Tailwind directive: @${rule.name}`);
        }

        if (rule.name === 'import' && /tailwindcss/.test(rule.params)) {
            errors.push('Tailwind stylesheet import');
        }
    });

    root.walkDecls((declaration) => {
        if (
            declaration.prop.startsWith('--tw-') ||
            declaration.value.includes('--tw-')
        ) {
            errors.push(`Tailwind runtime variable: ${declaration.prop}`);
        }

        if (declaredTokens) {
            for (const match of declaration.value.matchAll(
                /var\((--(?:size|space|radius)-[\w-]+)/g,
            )) {
                if (!declaredTokens.has(match[1]!)) {
                    errors.push(`Undefined geometry token: ${match[1]}`);
                }
            }
        }

        if (filename.endsWith('geometry-tokens.css')) {
            return;
        }

        if (!tokenFamily(declaration.prop)) {
            return;
        }

        replaceLengths(declaration.value, (pixels) => {
            errors.push(`Untokenized length: ${declaration.prop}: ${pixels}px`);

            return '';
        });
    });

    return errors;
}

export function inspectWorkspaceArtifacts(rootPath = webRoot): string[] {
    const errors: string[] = [];
    for (const name of readdirSync(rootPath)) {
        if (/^tailwind\.config\./.test(name)) {
            errors.push(`${name}: Tailwind configuration`);
        }

        if (!/^(?:postcss\.config\.|\.postcssrc)/.test(name)) {
            continue;
        }

        const source = ts.createSourceFile(
            name,
            readFileSync(join(rootPath, name), 'utf8'),
            ts.ScriptTarget.Latest,
            true,
        );
        const inspect = (node: ts.Node) => {
            if (
                (ts.isStringLiteralLike(node) &&
                    /^(?:tailwindcss(?:\/.*)?|@tailwindcss\/.*)$/.test(
                        node.text,
                    )) ||
                (ts.isIdentifier(node) && node.text === 'tailwindcss')
            ) {
                errors.push(`${name}: Tailwind PostCSS plugin`);
            }

            ts.forEachChild(node, inspect);
        };

        inspect(source);
    }

    const manifestPath = join(rootPath, 'package.json');
    if (existsSync(manifestPath)) {
        const manifest = JSON.parse(
            readFileSync(manifestPath, 'utf8'),
        ) as Record<string, Record<string, unknown> | undefined>;

        for (const field of [
            'dependencies',
            'devDependencies',
            'optionalDependencies',
            'peerDependencies',
        ]) {
            for (const name of Object.keys(manifest[field] ?? {})) {
                if (
                    name === 'tailwindcss' ||
                    name.startsWith('@tailwindcss/')
                ) {
                    errors.push(`package.json: Tailwind dependency ${name}`);
                }
            }
        }
    }

    return [...new Set(errors)];
}

export function checkStyles(rootPath = webRoot): string[] {
    const files = ['src', '.storybook']
        .map((directory) => join(rootPath, directory))
        .filter(existsSync)
        .flatMap(sourceFiles);
    const declaredTokens = new Set<string>();
    for (const path of files.filter((path) => path.endsWith('.css'))) {
        postcss.parse(readFileSync(path, 'utf8')).walkDecls((declaration) => {
            declaredTokens.add(declaration.prop);
        });
    }

    return [
        ...inspectWorkspaceArtifacts(rootPath),
        ...inspectComponentStructure(
            new Map(
                files
                    .filter((path) => /\.(?:css|[cm]?[jt]sx?)$/.test(path))
                    .map((path) => [path, readFileSync(path, 'utf8')]),
            ),
            rootPath,
        ),
        ...files.flatMap((path) => {
            const extension = extname(path);
            if (
                !['.css', '.ts', '.tsx', '.js', '.jsx', '.mdx'].includes(
                    extension,
                )
            ) {
                return [];
            }

            const source = readFileSync(path, 'utf8');
            const errors =
                extension === '.css'
                    ? inspectCss(source, path, declaredTokens)
                    : inspectMarkup(source, path);

            return errors.map(
                (error) => `${path.replace(`${rootPath}/`, '')}: ${error}`,
            );
        }),
    ];
}

if (
    process.argv[1] &&
    resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
    const errors = checkStyles();
    if (errors.length) {
        console.error(errors.join('\n'));
        process.exitCode = 1;
    } else {
        console.log('Web styling contract passed.');
    }
}
