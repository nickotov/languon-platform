import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SampleFeedback } from './sample-feedback';
import { guideActivities } from '../../lib/examples';
import { guideUiCopy } from '../copy';
import { guideBlockLabels } from '../labels';

const meta = {
    title: 'Pages/Workbook guide/Sample feedback',
    component: SampleFeedback,
    args: {
        responses: guideActivities('en').find(
            (item) => item.activity.id === 'R04',
        )!.sampleResponses,
        copy: guideUiCopy('en'),
        labels: guideBlockLabels('en'),
    },
} satisfies Meta<typeof SampleFeedback>;

export default meta;
export const PresetResponses: StoryObj<typeof meta> = {};
export const French: StoryObj<typeof meta> = {
    args: {
        responses: guideActivities('fr').find(
            (item) => item.activity.id === 'R04',
        )!.sampleResponses,
        copy: guideUiCopy('fr'),
        labels: guideBlockLabels('fr'),
    },
};
