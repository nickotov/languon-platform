import { screen } from '@testing-library/react';
import type { GenerationRunSummary } from '@languon/contracts';
import { expect, it } from 'vitest';
import { LessonRunTaskList } from '../src/fsd/features/lesson-generation/ui/lesson-run-task-list/lesson-run-task-list';
import { lessonRun, runId } from './lesson-run-fixture';
import { render } from './render';

it('marks only the active unit as the current step', () => {
    const active: GenerationRunSummary = {
        ...lessonRun,
        pauseReason: undefined,
        state: 'running',
        activeTurnId: runId,
        tasks: [
            ...lessonRun.tasks,
            {
                id: 'writing',
                kind: 'prose',
                label: 'Writing',
                status: 'running',
            },
        ],
    };

    render(<LessonRunTaskList run={active} />);
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent(
        'Writing',
    );
});

it('keeps a scheduled repair static between worker stages', () => {
    render(
        <LessonRunTaskList
            run={{
                ...lessonRun,
                automation: {
                    enabled: true,
                    recoveringTaskId: 'grammar',
                    maximumCredits: '1',
                    remainingCredits: '1',
                },
            }}
        />,
    );

    expect(screen.getByRole('list')).toHaveTextContent('COD and COI');
    expect(screen.queryByRole('listitem', { current: 'step' })).toBeNull();
});
