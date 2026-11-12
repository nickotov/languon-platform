import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { inspectComponentStructure } from '../scripts/component-structure';

const root = resolve('/fixture/web');

function inspect(files: Record<string, string>): string[] {
    const inventory = new Map(
        Object.entries(files).map(([path, source]) => [
            resolve(root, 'src/fsd', path),
            source,
        ]),
    );

    return inspectComponentStructure(inventory, root);
}

describe('FSD component ownership', () => {
    it('allows nested private parts, helpers, barrels and colocated styles', () => {
        expect(
            inspect({
                'widgets/chat/ui/chat/chat.tsx': `
                    import styles from './chat.module.css';
                    function PrivatePart() { return <div />; }
                    export function useChat() { return {}; }
                    export function formatChat() { return ''; }
                    export function Chat() { return <PrivatePart />; }
                `,
                'widgets/chat/ui/chat/chat.module.css': '',
                'widgets/chat/ui/chat/ui/message/message.tsx':
                    'export const Message = () => <div />;',
                'widgets/chat/ui/chat/index.ts':
                    "export { Chat } from './chat';",
                'features/auth/model/auth-provider.tsx': `
                    export function AuthProvider() { return null; }
                    export function AnotherProvider() { return null; }
                `,
            }),
        ).toEqual([]);
    });

    it('requires separate folders for production modules and skips story/test modules', () => {
        const errors = inspect({
            'widgets/chat/ui/chat.tsx': 'export function Chat() {}',
            'widgets/chat/ui/message/message.tsx':
                'export function Message() {}',
            'widgets/chat/ui/message/message-tools.jsx':
                'export const Tools = () => null;',
            'widgets/chat/ui/message/message.stories.tsx':
                'export const First = () => null; export const Second = () => null;',
            'widgets/chat/ui/message/message.test.tsx': '',
        });

        expect(errors).toEqual([
            'src/fsd/widgets/chat/ui/chat.tsx: Component module needs its own folder.',
            'src/fsd/widgets/chat/ui/message: Component folder contains multiple modules: message.tsx, message-tools.jsx.',
        ]);
    });

    it.each([
        'export function Card() { return null; } export function Footer() { return null; }',
        'export const Card = () => <div />; export const Footer = React.memo(() => null);',
        'export const Card = memo(() => null); export const Footer = forwardRef(() => null);',
        'export const Card = React.forwardRef(() => null); export default () => null;',
        'function Card() { return null; } const Footer = () => null; export { Card, Footer as End };',
        'export function Card() { return null; } export default memo(() => null);',
        'export function Card() { return null; } export default function widget() { return null; }',
        'export function Card() { return null; } export default function() { return null; }',
    ])('rejects independently exported components: %s', (source) => {
        expect(inspect({ 'shared/ui/card/card.tsx': source })).toEqual([
            expect.stringContaining('Export one component per module:'),
        ]);
    });

    it('allows a single default component and uppercase non-component values', () => {
        expect(
            inspect({
                'shared/ui/card/card.tsx': `
                    export const Variants = { compact: true };
                    export const LABEL = 'Card';
                    export default function Card() { return null; }
                `,
            }),
        ).toEqual([]);
    });

    it('allows deliberately shared modules and resolves the source alias', () => {
        expect(
            inspect({
                'widgets/chat/ui/chat/chat.tsx': `
                    import common from '../chat-common.module.css';
                    import colors from '@/fsd/widgets/chat/ui/styles/colors.module.css';
                    export function Chat() { return null; }
                `,
                'widgets/chat/ui/chat-common.module.css': '',
                'widgets/chat/ui/styles/colors.module.css': '',
            }),
        ).toEqual([]);
    });

    it('rejects sibling private CSS imports, including outside UI modules', () => {
        const errors = inspect({
            'widgets/chat/ui/chat/chat.tsx': `
                import styles from '../message/message.module.css';
                export function Chat() { return null; }
            `,
            'widgets/chat/model/styles.ts':
                "import styles from '@/fsd/widgets/chat/ui/message/message.module.css';",
            'widgets/chat/ui/message/message.module.css': '',
        });

        expect(errors).toHaveLength(2);
        expect(errors).toEqual([
            expect.stringContaining('Private CSS module must be colocated'),
            expect.stringContaining('Private CSS module must be colocated'),
        ]);
    });

    it('reports missing private and shared CSS files rather than treating names as evidence', () => {
        expect(
            inspect({
                'shared/ui/card/card.tsx': `
                    import privateStyles from './card.module.css';
                    import common from '../card-common.module.css';
                    export function Card() { return null; }
                `,
            }),
        ).toEqual([
            'src/fsd/shared/ui/card/card.tsx: CSS module does not exist: ./card.module.css',
            'src/fsd/shared/ui/card/card.tsx: CSS module does not exist: ../card-common.module.css',
        ]);
    });
});
