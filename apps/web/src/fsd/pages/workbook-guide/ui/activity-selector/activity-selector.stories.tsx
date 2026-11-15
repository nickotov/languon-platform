import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ActivitySelector } from './activity-selector';
import { guideActivities } from '../../lib/examples';
import styles from './activity-selector.stories.module.css';

function handleSelect() {}

const meta = {
    title: 'Pages/Workbook guide/Activity selector',
    component: ActivitySelector,
    decorators: [
        (Story) => (
            <div className={styles.preview}>
                <div className={styles.layout}>
                    <Story />
                </div>
            </div>
        ),
    ],
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

export const LastActivity: StoryObj<typeof meta> = {
    args: { selected: 'W01' },
};

export const MobileDock: StoryObj<typeof meta> = {
    parameters: { viewport: { defaultViewport: 'mobile1' } },
};
