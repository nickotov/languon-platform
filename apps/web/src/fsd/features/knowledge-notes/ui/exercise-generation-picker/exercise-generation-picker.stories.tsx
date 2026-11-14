import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState, type ComponentProps } from 'react';
import { exerciseActivityCatalog } from '@languon/contracts';
import { Button } from '@/fsd/shared/ui';
import { ExerciseGenerationPicker } from './exercise-generation-picker';

const id = '11111111-1111-4111-8111-111111111111';
const grammarId = '22222222-2222-4222-8222-222222222222';
const textId = '33333333-3333-4333-8333-333333333333';

function ignore() {}

function PickerStory(props: ComponentProps<typeof ExerciseGenerationPicker>) {
    const [open, setOpen] = useState(true);
    const [prepared, setPrepared] = useState(false);
    function close() {
        setOpen(false);
    }

    function show() {
        setOpen(true);
    }

    function prepare() {
        setPrepared(true);
        close();
    }

    return (
        <>
            <Button onClick={show}>Generate exercises</Button>
            {prepared && (
                <p role='status'>Request prepared for explicit Send.</p>
            )}
            {open && (
                <ExerciseGenerationPicker
                    {...props}
                    onClose={close}
                    onPrepare={prepare}
                />
            )}
        </>
    );
}

const meta = {
    title: 'Knowledge/Exercise generation',
    component: ExerciseGenerationPicker,
    args: {
        sources: [
            {
                id,
                type: 'vocabulary',
                title: 'Travel and transport',
                language: 'en',
            },
        ],
        selectedIds: [id],
        locale: 'en',
        onClose: ignore,
        onPrepare: ignore,
    },
    render: (args) => <PickerStory {...args} />,
} satisfies Meta<typeof ExerciseGenerationPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Automatic: Story = {};
export const SelectedThree: Story = {
    args: {
        initialRequest: {
            mode: 'selected',
            count: 5,
            activities: [
                { activityId: 'V02', count: 2 },
                { activityId: 'V03', count: 2 },
                { activityId: 'V01', count: 1 },
            ],
            language: 'en',
            explanationLanguage: 'en',
            difficulty: 'intermediate',
        },
    },
};
export const MoreActivitiesThanCount: Story = {
    args: {
        initialRequest: {
            mode: 'selected',
            count: 2,
            activities: [
                { activityId: 'V02', count: 1 },
                { activityId: 'V03', count: 1 },
                { activityId: 'V01', count: 1 },
            ],
            language: 'en',
            explanationLanguage: 'en',
            difficulty: 'intermediate',
        },
    },
};
export const MissingSource: Story = { args: { sources: [], selectedIds: [] } };
export const MissingLanguage: Story = {
    args: {
        sources: [
            {
                id,
                type: 'grammar',
                title: 'A rule without a selected language',
            },
        ],
    },
};
export const Busy: Story = { args: { busy: true } };
export const MixedCatalogInFrench: Story = {
    args: {
        sources: [
            {
                id,
                type: 'vocabulary',
                title: 'Le vocabulaire des déplacements et des changements de programme',
                language: 'en',
            },
            {
                id: grammarId,
                type: 'grammar',
                title: 'Passé et voix passive',
                language: 'en',
            },
            {
                id: textId,
                type: 'bilingual-text',
                title: 'Un long texte sur un voyage inattendu et ses conséquences',
                language: 'en',
            },
        ],
        selectedIds: [id, grammarId, textId],
        locale: 'fr',
        initialRequest: {
            mode: 'selected',
            count: 19,
            activities: exerciseActivityCatalog.map((activity) => ({
                activityId: activity.id,
                count: 1,
            })),
            language: 'en',
            explanationLanguage: 'fr',
            difficulty: 'intermediate',
        },
    },
};
