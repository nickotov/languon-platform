import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { GrammarCallout } from './grammar-callout';
export default {
    title: 'UI/Grammar callout',
    component: GrammarCallout,
} satisfies Meta<typeof GrammarCallout>;
export const Variants: StoryObj<typeof GrammarCallout> = {
    render: () => (
        <div style={{ display: 'grid', gap: 12, maxWidth: 680 }}>
            {(['rule', 'tip', 'warning', 'example'] as const).map((variant) => (
                <GrammarCallout
                    key={variant}
                    variant={variant}
                    title='Gendered articles'
                >
                    Match the article to the noun.
                </GrammarCallout>
            ))}
        </div>
    ),
};
