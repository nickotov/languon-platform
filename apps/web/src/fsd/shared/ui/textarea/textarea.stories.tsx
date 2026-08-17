import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Textarea } from './textarea';
const meta = { component: Textarea, title: 'UI/Textarea' } satisfies Meta<
    typeof Textarea
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
    args: { 'aria-label': 'Notes', placeholder: 'Write a note' },
};
export const Invalid: Story = {
    args: {
        'aria-invalid': true,
        'aria-label': 'Notes',
        defaultValue: 'Too short',
    },
};
export const ReadOnly: Story = {
    args: {
        'aria-label': 'Notes',
        readOnly: true,
        value: 'Saved lesson notes',
    },
};
export const Disabled: Story = {
    args: {
        'aria-label': 'Notes',
        disabled: true,
        value: 'Notes unavailable',
    },
};
export const NarrowMixedLanguage: Story = {
    args: {
        'aria-label': 'Notes',
        placeholder: 'Заметка · Lesson note',
    },
    parameters: { viewport: { defaultViewport: 'mobile1' } },
};
