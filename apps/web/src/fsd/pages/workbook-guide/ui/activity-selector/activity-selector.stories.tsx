import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ActivitySelector } from './activity-selector';
import { guideActivities } from '../../lib/examples';

function handleSelect() {}

const meta = {
    title: 'Pages/Workbook guide/Activity selector',
    component: ActivitySelector,
    args: {
        locale: 'en',
        activities: guideActivities('en'),
        selected: 'V02',
        onSelect: handleSelect,
    },
} satisfies Meta<typeof ActivitySelector>;

export default meta;
export const GroupedActivities: StoryObj<typeof meta> = {};
export const LongLocalizedNames: StoryObj<typeof meta> = {
    args: { locale: 'ru', activities: guideActivities('ru'), selected: 'G03' },
};
