import { describe, expect, it } from 'vitest';

import {
    inspectCss,
    inspectMarkup,
    replaceLengths,
    tokenFamily,
    tokenName,
} from '../scripts/style-contract';

describe('CSS-only styling contract', () => {
    it('permits AI SDK protocol literals while still rejecting alignment utilities in class attributes', () => {
        expect(
            inspectMarkup(
                'const event = { type: "text-start" }; const delta = "text-delta"; const end = "text-end";',
            ),
        ).toEqual([]);
        expect(
            inspectMarkup('<div className="text-start text-end" />'),
        ).toEqual(
            expect.arrayContaining([
                'Tailwind utility: text-start',
                'Tailwind utility: text-end',
            ]),
        );
    });
    it('rejects utilities in direct, conditional and computed class names', () => {
        expect(
            inspectMarkup('<div className="flex items-center" />'),
        ).toHaveLength(2);
        expect(
            inspectMarkup(
                'const variant = active ? "grid" : "hidden"; const classes = variant; const view = <div className={classes} />;',
            ),
        ).toEqual(
            expect.arrayContaining([
                'Tailwind utility: grid',
                'Tailwind utility: hidden',
            ]),
        );
        expect(
            inspectMarkup(
                'const classes = `px-${size} hover:bg-primary-600`; const view = <div className={classes} />;',
            ),
        ).toEqual(
            expect.arrayContaining([
                'Tailwind utility: px-',
                'Tailwind utility: hover:bg-primary-600',
            ]),
        );
        expect(
            inspectMarkup(
                'function classes() { return "flex"; } const view = <div className={classes()} />;',
            ),
        ).toContain('Tailwind utility: flex');
        expect(
            inspectMarkup('const variant = {compact: "p-2", default: "p-4"};'),
        ).toHaveLength(2);
    });

    it('allows named module classes, ordinary copy and imports', () => {
        expect(
            inspectMarkup(
                'import styles from "./flex-panel.module.css"; const classes = styles.layout; const view = <div className={classes}>A relative of mine</div>; const label = "flex";',
            ),
        ).toEqual([]);
        expect(inspectMarkup('<div className={styles[variant]} />')).toEqual(
            [],
        );
    });

    it('allows the text-folders API discriminator while still checking class attributes', () => {
        expect(inspectMarkup('const resource = "text-folders";')).toEqual([]);
        expect(inspectMarkup('<div className="text-folders" />')).toEqual([
            'Tailwind utility: text-folders',
        ]);
    });

    it('rejects variants and arbitrary utility values without splitting their internal colon', () => {
        expect(
            inspectMarkup(
                '<div className="[&>span]:text-sm bg-[color:var(--primary-default)] md:hover:!px-4 -translate-x-2" />',
            ),
        ).toHaveLength(4);
    });

    it('checks presentation class props and rejects only static inline styling', () => {
        expect(
            inspectMarkup(
                '<Menu triggerClassName="flex" menuClassName="hidden" />',
            ),
        ).toHaveLength(2);
        expect(
            inspectMarkup(
                'const cardStyle = { padding: "12px", opacity: pending ? 0 : 1 }; const view = <div style={cardStyle} />;',
            ),
        ).toEqual(['Static inline presentation: padding']);
        expect(
            inspectMarkup(
                '<div style={{ width: `${percent}%`, transform: drag.transform, opacity: departing ? 0 : 1 }} />',
            ),
        ).toEqual([]);
        expect(
            inspectMarkup(
                '<div style={{ padding: "12px" }} />',
                '/src/app/icon.tsx',
            ),
        ).toEqual([]);
    });

    it('rejects directives, former runtime variables and eligible literals', () => {
        expect(
            inspectCss(
                '@tailwind utilities; .card { padding: 12px; width: 2.75rem; border-radius: 8px; --tw-shadow: none; }',
            ),
        ).toHaveLength(5);
        expect(
            inspectCss(
                '.card { margin-inline: -0.5rem; grid-template-columns: 300px 1fr; }',
            ),
        ).toHaveLength(2);
        expect(inspectCss('@apply flex;')).toContain(
            'Tailwind directive: @apply',
        );
        expect(inspectCss('@import "tailwindcss";')).toContain(
            'Tailwind stylesheet import',
        );
        expect(inspectCss('.card { --style-translate-x: 24px; }')).toHaveLength(
            1,
        );
    });

    it('guards shorthand bases, custom geometry, shadow and blur lengths', () => {
        const errors = inspectCss(`
            .fixture { flex: 1 1 240px; --app-sidebar-center-offset: 120px;
                --elevation-sm: 0 1px 4px #000; filter: blur(4px);
                backdrop-filter: blur(4px); }
        `);
        expect(errors).toHaveLength(6);
        for (const property of [
            'flex',
            '--app-sidebar-center-offset',
            '--elevation-sm',
            'filter',
            'backdrop-filter',
        ])
            expect(errors.some((error) => error.includes(`${property}:`))).toBe(
                true,
            );
    });

    it('allows token consumers and intentionally native CSS values', () => {
        expect(
            inspectCss(
                '@media (min-width: 768px) { .card { width: 100%; min-height: 100dvh; border: 1px solid; line-height: 1.5; padding: 0 var(--space-16); border-radius: 50%; transform: translateX(50%); font-size: 0.85em; } }',
            ),
        ).toEqual([]);
        expect(
            inspectCss(':root { --size-44: 2.75rem; }', 'geometry-tokens.css'),
        ).toEqual([]);
        expect(
            inspectCss('.card { background-image: url("12px.svg"); }'),
        ).toEqual([]);
        expect(inspectCss(':root { --radius-full: 9999px; }')).toEqual([]);
    });

    it('allows non-presentation strings and geometry helper mappings', () => {
        expect(
            inspectMarkup(
                'const headers = ["content-type", "content-length", "content-disposition"]; const placement = "bottom-end"; const queryKey = ["text-ai-catalog"];',
            ),
        ).toEqual([]);
        expect(
            inspectMarkup(
                'const opposite = {top: "bottom", left: "right"}; function position(x) { return {left: x, [opposite.top]: x}; } const view = <div style={position(offset)} />;',
            ),
        ).toEqual([]);
        expect(
            inspectMarkup(
                'const opposite = {top: "bottom", left: "right"}; function position(x): CSSProperties { const side = "top" as keyof typeof opposite; return {left: x, [opposite[side]]: 2}; } const offset = position(x); const view = <div style={offset} />;',
            ),
        ).toEqual([]);
    });

    it('maps families and converts exact lengths without altering strings or relative units', () => {
        expect(tokenFamily('padding-inline')).toBe('space');
        expect(tokenFamily('border-top-left-radius')).toBe('radius');
        expect(tokenFamily('height')).toBe('size');
        expect(tokenFamily('border-width')).toBeUndefined();
        expect(tokenName('size', 12.8)).toBe('--size-12-8');
        expect(
            replaceLengths(
                '12px 0 -0.5rem 1em 100% url("16px.svg")',
                (pixels) => `[${pixels}]`,
            ),
        ).toBe('[12] 0 [-8] 1em 100% url("16px.svg")');
    });

    it('rejects references to undefined geometry tokens including fallback expressions', () => {
        expect(
            inspectCss(
                '.card { padding: var(--space-17); width: var(--size-44); }',
                'card.module.css',
                new Set(['--size-44']),
            ),
        ).toEqual(['Undefined geometry token: --space-17']);
        expect(
            inspectCss(
                '.card { padding: var(--space-16); }',
                'card.module.css',
                new Set(['--space-16']),
            ),
        ).toEqual([]);
    });
});
