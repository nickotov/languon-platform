import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Input } from './input';
const meta = { component: Input, title: 'UI/Input' } satisfies Meta<
    typeof Input
>;
export default meta;
export const Default: StoryObj<typeof meta> = {
    args: { 'aria-label': 'Email', type: 'email' },
};
export const ReadOnly: StoryObj<typeof meta> = {
    args: {
        'aria-label': 'Email',
        readOnly: true,
        value: 'learner@example.test',
    },
};
export const Invalid: StoryObj<typeof meta> = {
    args: {
        'aria-invalid': true,
        'aria-label': 'Email',
        defaultValue: 'not-an-email',
        type: 'email',
    },
};
export const Disabled: StoryObj<typeof meta> = {
    args: {
        'aria-label': 'Email',
        defaultValue: 'learner@example.test',
        disabled: true,
    },
};
export const ControlSizes: StoryObj<typeof meta> = {
    args: { 'aria-label': 'Email' },
    render: () => (
        <div style={{ display: 'grid', gap: 12 }}>
            <Input aria-label='Small input' controlSize='small' />
            <Input aria-label='Medium input' controlSize='medium' />
            <Input aria-label='Large input' controlSize='large' />
        </div>
    ),
};
export const NarrowMixedLanguage: StoryObj<typeof meta> = {
    args: {
        'aria-label': 'Word or phrase',
        controlSize: 'large',
        placeholder: 'Слово или фраза · Word or phrase',
    },
    parameters: { viewport: { defaultViewport: 'mobile1' } },
};
