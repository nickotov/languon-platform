import { basename, dirname, relative, resolve, sep } from 'node:path';

import ts from 'typescript';

function hasExportModifier(node: ts.Node): boolean {
    return (
        ts.canHaveModifiers(node) &&
        (ts
            .getModifiers(node)
            ?.some(
                (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
            ) ??
            false)
    );
}

function isComponentInitializer(node: ts.Expression): boolean {
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
        return true;
    }

    if (ts.isParenthesizedExpression(node)) {
        return isComponentInitializer(node.expression);
    }

    if (!ts.isCallExpression(node)) {
        return false;
    }

    const wrapper = node.expression;
    const name = ts.isPropertyAccessExpression(wrapper)
        ? wrapper.name.text
        : ts.isIdentifier(wrapper) && wrapper.text;

    return name === 'memo' || name === 'forwardRef';
}

function exportedComponents(source: ts.SourceFile): string[] {
    const definitions = new Set<string>();
    const exports = new Set<string>();

    for (const statement of source.statements) {
        if (ts.isFunctionDeclaration(statement)) {
            const name = statement.name?.text ?? 'default';
            const isDefault = statement.modifiers?.some(
                (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
            );

            if (/^[A-Z]/.test(name) || isDefault) {
                definitions.add(name);
                if (hasExportModifier(statement)) {
                    exports.add(name);
                }
            }
        }

        if (ts.isVariableStatement(statement)) {
            for (const declaration of statement.declarationList.declarations) {
                if (
                    ts.isIdentifier(declaration.name) &&
                    /^[A-Z]/.test(declaration.name.text) &&
                    declaration.initializer &&
                    isComponentInitializer(declaration.initializer)
                ) {
                    definitions.add(declaration.name.text);
                    if (hasExportModifier(statement)) {
                        exports.add(declaration.name.text);
                    }
                }
            }
        }

        if (
            ts.isExportDeclaration(statement) &&
            !statement.moduleSpecifier &&
            statement.exportClause &&
            ts.isNamedExports(statement.exportClause)
        ) {
            for (const element of statement.exportClause.elements) {
                if (!element.isTypeOnly) {
                    exports.add((element.propertyName ?? element.name).text);
                }
            }
        }

        if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
            if (ts.isIdentifier(statement.expression)) {
                exports.add(statement.expression.text);
            } else if (isComponentInitializer(statement.expression)) {
                definitions.add('default');
                exports.add('default');
            }
        }
    }

    return [...definitions].filter((name) => exports.has(name));
}

function inspectStyleImports(
    source: ts.SourceFile,
    files: ReadonlyMap<string, string>,
    rootPath: string,
): string[] {
    const errors: string[] = [];
    for (const statement of source.statements) {
        if (
            !ts.isImportDeclaration(statement) ||
            !ts.isStringLiteral(statement.moduleSpecifier)
        ) {
            continue;
        }

        const specifier = statement.moduleSpecifier.text;
        if (!specifier.endsWith('.module.css')) {
            continue;
        }

        let target: string;
        if (specifier.startsWith('@/')) {
            target = resolve(rootPath, 'src', specifier.slice(2));
        } else if (specifier.startsWith('.')) {
            target = resolve(dirname(source.fileName), specifier);
        } else {
            continue;
        }

        if (!files.has(target)) {
            errors.push(`CSS module does not exist: ${specifier}`);
            continue;
        }

        const shared =
            basename(target).endsWith('-common.module.css') ||
            target.split(sep).join('/').includes('/ui/styles/');

        if (!shared && dirname(target) !== dirname(source.fileName)) {
            errors.push(
                `Private CSS module must be colocated with its component: ${specifier}`,
            );
        }
    }

    return errors;
}

// Receive the existing style check's file inventory, keeping fixtures isolated
// and avoiding a second filesystem walker or another lint command.
export function inspectComponentStructure(
    files: ReadonlyMap<string, string>,
    rootPath: string,
): string[] {
    const fsdRoot = resolve(rootPath, 'src/fsd');
    const componentFolders = new Map<string, string[]>();
    const errors: string[] = [];

    for (const [path, content] of files) {
        if (!path.startsWith(`${fsdRoot}${sep}`)) {
            continue;
        }

        const sourcePath = relative(rootPath, path);
        if (!/\.[cm]?[jt]sx?$/.test(path)) {
            continue;
        }

        const source = ts.createSourceFile(
            path,
            content,
            ts.ScriptTarget.Latest,
            true,
        );

        errors.push(
            ...inspectStyleImports(source, files, rootPath).map(
                (error) => `${sourcePath}: ${error}`,
            ),
        );

        const inUi = relative(fsdRoot, path).split(sep).includes('ui');
        const fixture =
            /\.(?:stories|story|test|spec)\.[jt]sx?$/.test(path) ||
            path
                .split(sep)
                .some((part) =>
                    ['__tests__', '__fixtures__', '__stories__'].includes(part),
                );

        if (!inUi || fixture || !/\.[jt]sx$/.test(path)) {
            continue;
        }

        const folder = dirname(path);
        const components = componentFolders.get(folder) ?? [];
        components.push(basename(path));
        componentFolders.set(folder, components);

        if (basename(folder) === 'ui') {
            errors.push(
                `${sourcePath}: Component module needs its own folder.`,
            );
        }

        const exports = exportedComponents(source);
        if (exports.length > 1) {
            errors.push(
                `${sourcePath}: Export one component per module: ${exports.join(', ')}.`,
            );
        }
    }

    for (const [folder, modules] of componentFolders) {
        if (modules.length > 1) {
            errors.push(
                `${relative(rootPath, folder)}: Component folder contains multiple modules: ${modules.join(', ')}.`,
            );
        }
    }

    return errors;
}
