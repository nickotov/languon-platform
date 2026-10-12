import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import postcss from 'postcss';
import { afterEach, describe, expect, it } from 'vitest';

import {
    checkStyles,
    inspectMarkup,
    inspectWorkspaceArtifacts,
} from '../scripts/style-contract';
import { tokenizeCss } from '../scripts/tokenize-css';

const fixtures: string[] = [];
function fixture() {
    const directory = mkdtempSync(join(tmpdir(), 'languon-style-contract-'));
    fixtures.push(directory);
    return directory;
}
afterEach(() => {
    for (const directory of fixtures.splice(0))
        rmSync(directory, { recursive: true, force: true });
});

describe('workspace styling contract regressions', () => {
    it('checks catalog markup and CSS alongside application source', () => {
        const directory = fixture();
        const catalog = join(directory, '.storybook');
        mkdirSync(catalog);
        writeFileSync(
            join(catalog, 'preview.tsx'),
            '<div className="flex" style={{padding: 24}} />',
        );
        writeFileSync(
            join(catalog, 'preview.module.css'),
            '.canvas { max-width: 720px; }',
        );
        const errors = checkStyles(directory);
        expect(errors).toEqual(
            expect.arrayContaining([
                '.storybook/preview.tsx: Tailwind utility: flex',
                '.storybook/preview.tsx: Static inline presentation: padding',
            ]),
        );
        expect(
            errors.some((error) =>
                error.startsWith('.storybook/preview.module.css:'),
            ),
        ).toBe(true);
    });

    it('rejects identifier object keys in conditional class helpers', () => {
        expect(
            inspectMarkup(
                '<div className={clsx({ flex: active, hidden: collapsed })} />',
            ),
        ).toEqual(
            expect.arrayContaining([
                'Tailwind utility: flex',
                'Tailwind utility: hidden',
            ]),
        );
        expect(
            inspectMarkup(
                '<div className={clsx({ [styles.layout]: active })} />',
            ),
        ).toEqual([]);
    });

    it('checks spread-bound literal styles without rejecting runtime spreads', () => {
        expect(
            inspectMarkup(
                'const base = {padding: "12px"}; const alias = base; const view = <div style={{...alias, width: `${percent}%`}} />;',
            ),
        ).toEqual(['Static inline presentation: padding']);
        expect(
            inspectMarkup(
                'const base = {width: `${percent}%`, transform: drag.transform}; const view = <div style={{...base, ...floatingStyles}} />;',
            ),
        ).toEqual([]);
    });

    it('detects configuration files, dependencies and PostCSS plugins outside src', () => {
        const directory = fixture();
        writeFileSync(
            join(directory, 'tailwind.config.ts'),
            'export default {};',
        );
        writeFileSync(
            join(directory, 'package.json'),
            JSON.stringify({
                devDependencies: { tailwindcss: '3.4.17' },
                dependencies: { '@tailwindcss/postcss': '4.0.0' },
            }),
        );
        writeFileSync(
            join(directory, 'postcss.config.mjs'),
            'import plugin from "@tailwindcss/postcss"; export default {plugins: [plugin]};',
        );
        expect(inspectWorkspaceArtifacts(directory)).toEqual(
            expect.arrayContaining([
                'tailwind.config.ts: Tailwind configuration',
                'package.json: Tailwind dependency tailwindcss',
                'package.json: Tailwind dependency @tailwindcss/postcss',
                'postcss.config.mjs: Tailwind PostCSS plugin',
            ]),
        );
        writeFileSync(
            join(directory, 'postcss.config.mjs'),
            'export default { plugins: {tailwindcss: {}} };',
        );
        expect(inspectWorkspaceArtifacts(directory)).toContain(
            'postcss.config.mjs: Tailwind PostCSS plugin',
        );
    });

    it('allows a CSS-only workspace and ignores PostCSS comments', () => {
        const directory = fixture();
        writeFileSync(
            join(directory, 'package.json'),
            JSON.stringify({ devDependencies: { postcss: '^8' } }),
        );
        writeFileSync(
            join(directory, 'postcss.config.mjs'),
            '// removed tailwindcss\nexport default {plugins: {autoprefixer: {}}};',
        );
        expect(inspectWorkspaceArtifacts(directory)).toEqual([]);
    });

    it('tokenizes an isolated fixture exactly and makes the second run byte-identical', () => {
        const directory = fixture();
        const styles = join(directory, 'src/app/styles');
        mkdirSync(styles, { recursive: true });
        const tokenFile = join(styles, 'geometry-tokens.css');
        const componentFile = join(styles, 'card.module.css');
        writeFileSync(tokenFile, ':root { --size-4: 0.25rem; }');
        writeFileSync(
            componentFile,
            '.card { padding: 0.75rem 4px; margin-left: -12px; width: 12.8px; border-radius: 12px; border: 1px solid; height: 100%; }',
        );
        expect(tokenizeCss(directory)).toEqual({ changed: 1, lengths: 3 });
        const component = readFileSync(componentFile, 'utf8');
        const tokens = readFileSync(tokenFile, 'utf8');
        expect(component).toBe(
            '.card { padding: var(--space-12) var(--space-4); margin-left: calc(var(--space-12) * -1); width: var(--size-12-8); border-radius: var(--radius-12); border: 1px solid; height: 100%; }',
        );
        const definitions = new Map<string, string>();
        postcss.parse(tokens).walkDecls((declaration) => {
            definitions.set(declaration.prop, declaration.value);
        });
        expect(definitions.get('--size-4')).toBe('0.25rem');
        expect(definitions.get('--size-12')).toBe('0.75rem');
        expect(definitions.get('--size-12-8')).toBe('0.8rem');
        expect(definitions.get('--space-4')).toBe('var(--size-4)');
        expect(definitions.get('--space-12')).toBe('var(--size-12)');
        expect(definitions.get('--radius-12')).toBe('var(--size-12)');
        expect(tokenizeCss(directory)).toEqual({ changed: 0, lengths: 0 });
        expect(readFileSync(componentFile, 'utf8')).toBe(component);
        expect(readFileSync(tokenFile, 'utf8')).toBe(tokens);
    });
});
