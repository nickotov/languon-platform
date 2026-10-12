import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import postcss from 'postcss';

import {
    replaceLengths,
    sourceFiles,
    tokenFamily,
    tokenName,
    webRoot,
} from './style-contract';

// Mechanical migration helper. Run after all markup conversion workers finish.
// This writes authored source, never build/cache/dependency output.
export function tokenizeCss(rootPath = webRoot): {
    changed: number;
    lengths: number;
} {
    const tokenPath = join(rootPath, 'src/app/styles/geometry-tokens.css');
    const tokens = new Map<number, Set<string>>();
    const files = sourceFiles(join(rootPath, 'src')).filter(
        (path) => path.endsWith('.css') && path !== tokenPath,
    );
    let changed = 0;
    for (const path of files) {
        const source = readFileSync(path, 'utf8');
        const root = postcss.parse(source, { from: path });
        root.walkDecls((declaration) => {
            const family = tokenFamily(declaration.prop);
            if (!family) return;
            declaration.value = replaceLengths(declaration.value, (pixels) => {
                const magnitude = Math.abs(pixels);
                const families = tokens.get(magnitude) ?? new Set<string>();
                families.add(family);
                tokens.set(magnitude, families);
                const reference = `var(${tokenName(family, magnitude)})`;
                return pixels < 0 ? `calc(${reference} * -1)` : reference;
            });
        });
        const result = root.toString();
        if (result !== source) {
            writeFileSync(path, result);
            changed++;
        }
    }

    // Retain prior canonical definitions for already-tokenized consumers on reruns.
    const root = postcss.parse(readFileSync(tokenPath, 'utf8'));
    const existing = new Set<string>();
    root.walkDecls((declaration) => {
        existing.add(declaration.prop);
    });
    const tokenRule = root.nodes.find(
        (node) => node.type === 'rule' && node.selector === ':root',
    );
    if (!tokenRule || tokenRule.type !== 'rule')
        throw new Error('Geometry token :root is missing');
    for (const [pixels, families] of [...tokens].sort(
        ([left], [right]) => left - right,
    )) {
        for (const family of new Set(['size', ...families])) {
            const name = tokenName(family, pixels);
            if (!existing.has(name))
                tokenRule.append({
                    prop: name,
                    value:
                        family === 'size'
                            ? `${Number((pixels / 16).toFixed(8))}rem`
                            : `var(${tokenName('size', pixels)})`,
                });
        }
    }
    if (root.toString() !== readFileSync(tokenPath, 'utf8'))
        writeFileSync(tokenPath, root.toString());
    return { changed, lengths: tokens.size };
}

if (
    process.argv[1] &&
    resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
    const result = tokenizeCss();
    console.log(
        `Tokenized ${result.changed} CSS files; preserved ${result.lengths} distinct reference lengths.`,
    );
}
