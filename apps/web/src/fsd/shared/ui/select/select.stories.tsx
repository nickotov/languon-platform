import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Select } from './select';
const meta = { component: Select, title: 'UI/Select' } satisfies Meta<
    typeof Select
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
    args: {
        children: (
            <>
                <option>English</option>
                <option>Русский</option>
            </>
        ),
        'aria-label': 'Language',
    },
};
export const Disabled: Story = {
    args: {
        children: <option>Русский · Russian</option>,
        disabled: true,
        'aria-label': 'Language',
    },
};
