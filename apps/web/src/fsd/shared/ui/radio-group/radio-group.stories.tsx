import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { RadioGroup } from './radio-group';
const meta = { component: RadioGroup, title: 'UI/Radio group' } satisfies Meta<
    typeof RadioGroup
>;
export default meta;
export const Default: StoryObj<typeof meta> = {
    args: {
        defaultValue: 'calm',
        legend: 'Practice pace',
        name: 'pace',
        options: [
            { label: 'Calm', value: 'calm' },
            { label: 'Focused', value: 'focused' },
            {
                disabled: true,
                label: 'Intensive (unavailable)',
                value: 'intensive',
            },
        ],
    },
};
