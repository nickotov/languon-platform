import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const skillsDirectory = join(repositoryRoot, '.agents', 'skills');
const explicitlyInvokedSkills = new Set([
    'improve-codebase-architecture',
    'prototype',
    'web-dev-panel',
]);

function fail(path, message) {
    throw new Error(`${path}: ${message}`);
}

export function parseSkillFrontmatter(content, path) {
    const match = /^---\n([\s\S]*?)\n---\n/.exec(content);
    if (!match) fail(path, 'missing YAML frontmatter');

    const lines = match[1].split('\n');
    if (lines.length !== 2) {
        fail(path, 'frontmatter must contain only name and description');
    }

    const name = /^name: ([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(lines[0])?.[1];
    const description = /^description: (.+)$/.exec(lines[1])?.[1];
    if (!name) fail(path, 'name must be lowercase hyphen-case');
    if (!description) fail(path, 'description must be a non-empty scalar');
    if (name.length > 64) fail(path, 'name must be at most 64 characters');
    if (description.length > 1024) {
        fail(path, 'description must be at most 1024 characters');
    }
    if (description.includes('<') || description.includes('>')) {
        fail(path, 'description must not contain angle brackets');
    }
    if (content.split('\n').length > 500) {
        fail(path, 'SKILL.md must not exceed 500 lines');
    }

    return { name };
}

function unquote(value, path, key) {
    const quote = value[0];
    if ((quote !== "'" && quote !== '"') || value.at(-1) !== quote) {
        fail(path, `${key} must be a quoted string`);
    }
    return value.slice(1, -1);
}

export function parseOpenAiMetadata(content, path) {
    const lines = content.trimEnd().split('\n');
    if (lines[0] !== 'interface:') fail(path, 'must start with interface');

    const interfaceValues = new Map();
    let lineIndex = 1;
    while (
        lineIndex < lines.length &&
        /^ {4}[a-z_]+: /.test(lines[lineIndex])
    ) {
        const match = /^ {4}([a-z_]+): (.+)$/.exec(lines[lineIndex]);
        const [, key, rawValue] = match;
        if (interfaceValues.has(key)) fail(path, `duplicate interface.${key}`);
        interfaceValues.set(key, unquote(rawValue, path, `interface.${key}`));
        lineIndex += 1;
    }

    const allowedInterfaceKeys = new Set([
        'default_prompt',
        'display_name',
        'short_description',
    ]);
    for (const key of interfaceValues.keys()) {
        if (!allowedInterfaceKeys.has(key)) {
            fail(path, `unsupported interface key '${key}'`);
        }
    }
    for (const key of allowedInterfaceKeys) {
        if (!interfaceValues.get(key)) fail(path, `missing interface.${key}`);
    }

    let allowImplicitInvocation = true;
    if (lineIndex < lines.length && lines[lineIndex] === '') lineIndex += 1;
    if (lineIndex < lines.length) {
        if (
            lines[lineIndex] !== 'policy:' ||
            lines[lineIndex + 1] !== '    allow_implicit_invocation: false'
        ) {
            fail(path, 'unsupported policy metadata');
        }
        allowImplicitInvocation = false;
        lineIndex += 2;
    }
    if (lineIndex !== lines.length) fail(path, 'unexpected trailing metadata');

    return { allowImplicitInvocation, interfaceValues };
}

export function validateSkillPackage({
    directoryName,
    metadataContent,
    metadataPath,
    skillContent,
    skillPath,
}) {
    const { name } = parseSkillFrontmatter(skillContent, skillPath);
    const { allowImplicitInvocation, interfaceValues } = parseOpenAiMetadata(
        metadataContent,
        metadataPath,
    );

    if (name !== directoryName) {
        fail(
            skillPath,
            `name '${name}' must match directory '${directoryName}'`,
        );
    }
    const shortDescription = interfaceValues.get('short_description');
    if (shortDescription.length < 25 || shortDescription.length > 64) {
        fail(metadataPath, 'short_description must contain 25-64 characters');
    }
    if (!interfaceValues.get('default_prompt').includes(`$${name}`)) {
        fail(metadataPath, `default_prompt must mention $${name}`);
    }
    if (explicitlyInvokedSkills.has(name) === allowImplicitInvocation) {
        fail(
            metadataPath,
            explicitlyInvokedSkills.has(name)
                ? 'skill must disable implicit invocation'
                : 'unexpected implicit-invocation override',
        );
    }

    return name;
}

export async function validateRepositorySkills() {
    const entries = await readdir(skillsDirectory, { withFileTypes: true });
    const skillNames = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();

    if (skillNames.length === 0) {
        fail(skillsDirectory, 'no repository skills found');
    }

    for (const directoryName of skillNames) {
        const skillPath = join(skillsDirectory, directoryName, 'SKILL.md');
        const metadataPath = join(
            skillsDirectory,
            directoryName,
            'agents',
            'openai.yaml',
        );
        const [skillContent, metadataContent] = await Promise.all([
            readFile(skillPath, 'utf8'),
            readFile(metadataPath, 'utf8'),
        ]);
        validateSkillPackage({
            directoryName,
            metadataContent,
            metadataPath,
            skillContent,
            skillPath,
        });
    }

    return skillNames.length;
}

if (
    process.argv[1] &&
    resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
    try {
        const skillCount = await validateRepositorySkills();
        console.log(`Validated ${skillCount} repository agent skill(s).`);
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
}
