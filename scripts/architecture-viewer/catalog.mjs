import { createHash } from 'node:crypto';
import { readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import { z } from 'zod';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const metadataSchema = z.strictObject({
    type: z.literal('diagram'),
    title: z.string().min(1).max(120),
    summary: z.string().min(1).max(500),
    source_paths: z.array(z.string().min(1).max(300)).min(1).max(128),
    source_fingerprint: z.string().regex(/^(?:sha256:[a-f0-9]{64}|pending)$/u),
    reviewed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
});

function inside(root, file) {
    const path = relative(root, file);
    return (
        path !== '' &&
        !path.startsWith(`..${sep}`) &&
        path !== '..' &&
        !isAbsolute(path)
    );
}

export async function readConfined(root, path, maximumBytes = 1024 * 1024) {
    const base = await realpath(root);
    const file = await realpath(resolve(base, path));
    if (!inside(base, file))
        throw new Error('File is outside its allowed directory.');
    const info = await stat(file);
    if (!info.isFile() || info.size > maximumBytes)
        throw new Error('File is missing, too large or not regular.');
    return readFile(file);
}

// Intentionally support only the small, documented diagram frontmatter schema.
// No YAML evaluation, aliases, implicit object types or embedded configuration.
export function parseDiagram(content, id) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id))
        throw new Error('Invalid diagram filename.');
    const header = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/u.exec(content);
    if (!header) throw new Error('Diagram frontmatter is required.');
    const metadata = {};
    let currentList;
    for (const line of header[1].split(/\r?\n/u)) {
        if (line.trim() === '') continue;
        const item = /^ +[-] (.+)$/u.exec(line);
        if (item && currentList) {
            metadata[currentList].push(item[1]);
            continue;
        }
        const field = /^([a-z_]+):(?: (.*))?$/u.exec(line);
        if (!field || Object.hasOwn(metadata, field[1]))
            throw new Error('Invalid or duplicate metadata field.');
        const [, key, raw] = field;
        currentList = raw === undefined ? key : undefined;
        if (raw === undefined) metadata[key] = [];
        else if (raw.startsWith('"')) metadata[key] = JSON.parse(raw);
        else if (raw.startsWith("'")) {
            if (!raw.endsWith("'")) throw new Error('Unclosed metadata quote.');
            metadata[key] = raw.slice(1, -1).replaceAll("''", "'");
        } else metadata[key] = raw;
    }
    const parsed = metadataSchema.parse(metadata);
    if (new Set(parsed.source_paths).size !== parsed.source_paths.length)
        throw new Error('Duplicate source path.');
    const blocks = [
        ...content.matchAll(/^```mermaid\r?\n([\s\S]*?)^```\s*$/gmu),
    ];
    if (blocks.length !== 1)
        throw new Error('Exactly one Mermaid block is required.');
    const mermaid = blocks[0][1].trim();
    if (
        mermaid.length > 30_000 ||
        !/^(?:flowchart|graph|sequenceDiagram|stateDiagram-v2|erDiagram)\b/u.test(
            mermaid,
        )
    ) {
        throw new Error(
            'Use a bounded flowchart, sequence, state or ER diagram.',
        );
    }
    if (
        /%%\{|^\s*click\s|<\/?[a-z!]|https?:|\b(?:img|icon)\s*:/imu.test(
            mermaid,
        )
    ) {
        throw new Error(
            'Diagram directives, HTML, links and external resources are unsupported.',
        );
    }
    return {
        id,
        ...parsed,
        mermaid,
        notes: content.slice(header[0].length).replace(blocks[0][0], '').trim(),
    };
}

export async function sourceFingerprint(repositoryRoot, paths) {
    const entries = [];
    for (const path of [...paths].sort()) {
        if (
            path.includes('\\') ||
            path.startsWith('/') ||
            path
                .split('/')
                .some(
                    (part) =>
                        part === '..' ||
                        part.startsWith('.') ||
                        part === 'node_modules',
                )
        ) {
            throw new Error(`Invalid source path: ${path}`);
        }
        const content = await readConfined(
            repositoryRoot,
            path,
            4 * 1024 * 1024,
        );
        entries.push(`${path}\0${hash(content)}\n`);
    }
    return `sha256:${hash(entries.join(''))}`;
}

export async function loadCatalog(repositoryRoot, { stamp = false } = {}) {
    const directory = resolve(repositoryRoot, 'docs/diagrams');
    const names = (await readdir(directory))
        .filter((name) => name.endsWith('.md') && name !== 'README.md')
        .sort();
    if (names.length > 64) throw new Error('Too many diagram documents.');
    const diagrams = [];
    const issues = [];
    for (const name of names) {
        try {
            let content = (
                await readConfined(directory, name, 128 * 1024)
            ).toString('utf8');
            const diagram = parseDiagram(content, name.slice(0, -3));
            const expected = await sourceFingerprint(
                repositoryRoot,
                diagram.source_paths,
            );
            if (stamp) {
                // Explicit author operation only. The HTTP server never calls this branch.
                content = content.replace(
                    /^source_fingerprint: .*$/mu,
                    `source_fingerprint: ${expected}`,
                );
                content = content.replace(
                    /^reviewed: .*$/mu,
                    `reviewed: ${new Date().toISOString().slice(0, 10)}`,
                );
                await writeFile(
                    await realpath(resolve(directory, name)),
                    content,
                );
                diagram.source_fingerprint = expected;
                diagram.reviewed = new Date().toISOString().slice(0, 10);
            }
            diagrams.push({
                ...diagram,
                file: `docs/diagrams/${name}`,
                fresh: expected === diagram.source_fingerprint,
                expectedFingerprint: expected,
            });
        } catch (error) {
            issues.push({
                file: `docs/diagrams/${name}`,
                message:
                    error instanceof z.ZodError
                        ? 'Invalid diagram metadata.'
                        : error.message,
            });
        }
    }
    return { diagrams, issues };
}
