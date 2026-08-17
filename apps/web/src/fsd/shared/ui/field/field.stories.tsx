import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Input } from '../input/input';
import { Field } from './field';
const meta = { title: 'UI/Field' } satisfies Meta;
export default meta;
type Story = StoryObj;
export const Email: Story = {
    render: () => (
        <Field hint='We will only use this to sign you in.' label='Email'>
            <Input autoComplete='email' type='email' />
        </Field>
    ),
};
export const Error: Story = {
    render: () => (
        <Field error='Enter a valid email address.' label='Email'>
            <Input aria-invalid='true' type='email' />
        </Field>
    ),
};
export const Success: Story = {
    render: () => (
        <Field label='Email' success='Email address verified.'>
            <Input defaultValue='learner@example.test' type='email' />
        </Field>
    ),
};
