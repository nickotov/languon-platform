import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TutorActivity } from './tutor-activity';

const meta = {
    title: 'Widgets/Contextual assistant/Activity',
    component: TutorActivity,
    args: { active: true, queued: false, text: '' },
} satisfies Meta<typeof TutorActivity>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Waiting: Story = { args: { queued: true } };
export const Working: Story = {};
export const Reading: Story = { args: { tool: 'reading' } };
export const PreparingCards: Story = { args: { tool: 'preparingCards' } };
