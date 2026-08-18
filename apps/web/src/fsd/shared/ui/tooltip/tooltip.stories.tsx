import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Tooltip } from './tooltip';
const meta = { component: Tooltip, title: 'UI/Tooltip' } satisfies Meta<
    typeof Tooltip
>;
export default meta;
export const Default: StoryObj<typeof meta> = {
    args: {
        children: (
            <button aria-label='Progress information' type='button'>
                i
            </button>
        ),
        content: 'Your progress updates after each lesson.',
    },
};
export const LongLocalizedCopy: StoryObj<typeof meta> = {
    args: {
        children: (
            <button aria-label='Информация о прогрессе' type='button'>
                i
            </button>
        ),
        content: 'Ваш прогресс обновляется после каждого завершённого урока.',
    },
};
export const RichContent: StoryObj<typeof meta> = {
    args: {
        children: (
            <button aria-label='Streak information' type='button'>
                i
            </button>
        ),
        content: (
            <span>
                <strong>7 day streak</strong>
                <br />
                Complete one lesson today to keep it.
            </span>
        ),
        placement: 'top-end',
    },
    decorators: [
        (Story) => (
            <div
                style={{
                    alignItems: 'flex-start',
                    display: 'flex',
                    height: 180,
                    justifyContent: 'flex-end',
                    overflow: 'hidden',
                    width: '100%',
                }}
            >
                <Story />
            </div>
        ),
    ],
    parameters: { viewport: { defaultViewport: 'mobile1' } },
};
